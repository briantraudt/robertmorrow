"""Real-connection PostgreSQL inventory race tests; no payment network calls.

Requires psycopg2 and a LOCAL PostgreSQL server with database-create permission.
Creates an isolated database, applies the schema, runs independent transactions,
and drops that database on completion. Network database hosts are refused.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import threading
import uuid
from pathlib import Path

import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", default="/tmp/robertmorrow-pgsocket")
    parser.add_argument("--port", type=int, default=55432)
    parser.add_argument("--user", default="postgres")
    args = parser.parse_args()
    if not args.socket.startswith("/") or not Path(args.socket).is_dir():
        raise SystemExit("A local Unix-domain PostgreSQL socket directory is required.")

    project = Path(__file__).resolve().parents[1]
    database = f"rm_inventory_{uuid.uuid4().hex[:12]}_test"
    connection_options = {"host": args.socket, "port": args.port, "user": args.user}
    admin = psycopg2.connect(dbname="postgres", **connection_options)
    admin.set_client_encoding("UTF8")
    admin.autocommit = True
    created = False
    passed: list[str] = []

    def connect():
        conn = psycopg2.connect(dbname=database, **connection_options)
        conn.set_client_encoding("UTF8")
        with conn.cursor() as cursor:
            cursor.execute("set statement_timeout='8s'; set lock_timeout='5s';")
        return conn

    def query(statement, values=()):
        conn = connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute(statement, values) if values else cursor.execute(statement)
                result = cursor.fetchall() if cursor.description else []
            conn.commit()
            return result
        finally:
            conn.close()

    def fixture(label, price=500):
        painting_id = f"race-{label}"
        query("""insert into public.paintings(id,slug,title,year,series,medium,w,h,price)
                  values(%s,%s,%s,2026,'abstract','Acrylic',20,16,%s)""",
              (painting_id, painting_id, label, price))
        return painting_id

    def rid():
        return str(uuid.uuid4())

    def reserve_args(reservation_id, painting_ids, offer_id=None):
        return ("select public.reserve_inventory(%s,%s,%s,%s)",
                (reservation_id, painting_ids, Json({"email": "buyer@example.test"}), offer_id))

    def finalize_args(payment_id, painting_ids, amount, reservation_id=None):
        return ("select public.finalize_inventory_sale(%s,%s,%s,'usd',null,null,null,%s)",
                (payment_id, painting_ids, amount, reservation_id))

    def race(*calls):
        start = threading.Barrier(len(calls))

        def worker(call):
            conn = connect()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("set local role service_role")
                    start.wait(timeout=5)
                    cursor.execute(*call)
                    result = cursor.fetchone()[0]
                conn.commit()
                return {"ok": True, "result": result}
            except psycopg2.Error as error:
                conn.rollback()
                return {"ok": False, "code": error.pgcode, "error": error.diag.message_primary}
            finally:
                conn.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as pool:
            return list(pool.map(worker, calls))

    def one_winner(results):
        assert sum(row["ok"] for row in results) == 1, results
        loser = next(row for row in results if not row["ok"])
        assert loser["code"] == "P0001", results  # A business conflict, never a deadlock.

    try:
        with admin.cursor() as cursor:
            for role in ("anon", "authenticated", "service_role"):
                cursor.execute("select 1 from pg_roles where rolname=%s", (role,))
                if not cursor.fetchone():
                    cursor.execute(sql.SQL("create role {} nologin {}").format(
                        sql.Identifier(role), sql.SQL("bypassrls" if role == "service_role" else "")))
            cursor.execute(sql.SQL("create database {} encoding 'UTF8' template template0").format(sql.Identifier(database)))
            created = True

        # gen_random_uuid() is built into supported PostgreSQL versions. This
        # standalone test distribution has no optional extension control files.
        baseline = (project / "supabase/schema.sql").read_text().replace(
            'create extension if not exists "pgcrypto";', "")
        query(baseline)
        query((project / "supabase/inventory.sql").read_text())

        painting = fixture("same-painting")
        results = race(reserve_args(rid(), [painting]), reserve_args(rid(), [painting]))
        one_winner(results)
        assert query("select count(*) from public.inventory_holds where painting_id=%s", (painting,))[0][0] == 1
        passed.append("two buyers: exactly one exclusive hold")

        a, b, c = (fixture(f"overlap-{letter}") for letter in "abc")
        results = race(reserve_args(rid(), [b, a]), reserve_args(rid(), [c, b]))
        one_winner(results)
        winner_ids = set(next(row["result"]["painting_ids"] for row in results if row["ok"]))
        rows = query("select id,status from public.paintings where id=any(%s)", ([a, b, c],))
        assert all(status == ("reserved" if item in winner_ids else "available") for item, status in rows), rows
        passed.append("overlapping reversed carts: all-or-none without deadlock")

        a, b = fixture("idempotent-a"), fixture("idempotent-b")
        reservation_id = rid()
        results = race(reserve_args(reservation_id, [a, b]), reserve_args(reservation_id, [b, a]))
        assert all(row["ok"] for row in results), results
        assert query("select count(*) from public.inventory_holds where reservation_id=%s", (reservation_id,))[0][0] == 2
        passed.append("same checkout retried concurrently: one reservation")

        painting = fixture("offer-versus-cart")
        offer_id = rid()
        query("insert into public.offers(id,painting_id,name,email,amount) values(%s,%s,'Buyer','buyer@example.test',450)", (offer_id, painting))
        results = race(reserve_args(rid(), [painting], offer_id), reserve_args(rid(), [painting]))
        one_winner(results)
        expected = "accepted" if results[0]["ok"] else "new"
        assert query("select status from public.offers where id=%s", (offer_id,))[0][0] == expected
        passed.append("accepted offer versus cart: one buyer owns inventory")

        painting = fixture("duplicate-callback")
        reservation_id = rid()
        query(*reserve_args(reservation_id, [painting]))
        query("select public.bind_inventory_payment(%s,'pi_race_duplicate')", (reservation_id,))
        call = finalize_args("pi_race_duplicate", [painting], 50000, reservation_id)
        results = race(call, call)
        assert all(row["ok"] for row in results), results
        assert sorted(row["result"]["already_recorded"] for row in results) == [False, True]
        assert query("select count(*) from public.orders where stripe_payment_intent='pi_race_duplicate'")[0][0] == 1
        passed.append("concurrent payment callbacks: one order, one sale")

        painting = fixture("legacy-payments")
        results = race(finalize_args("pi_race_legacy1", [painting], 50000), finalize_args("pi_race_legacy2", [painting], 50000))
        one_winner(results)
        assert query("select count(*) from public.inventory_sales where painting_id=%s", (painting,))[0][0] == 1
        passed.append("legacy duplicate payments cannot overwrite sale ownership")

        painting = fixture("admin-versus-checkout")
        results = race(reserve_args(rid(), [painting]),
                       ("select public.rm_admin_save_painting(%s,%s,null,false,'available')",
                        (painting, Json({"note": "__rm_deleted__"}))))
        one_winner(results)
        status, note = query("select status,note from public.paintings where id=%s", (painting,))[0]
        assert (status, note) == (("reserved", None) if results[0]["ok"] else ("available", "__rm_deleted__"))
        passed.append("admin deletion versus checkout: atomic availability check")

        painting = fixture("release-after-sale")
        reservation_id = rid()
        query(*reserve_args(reservation_id, [painting]))
        query("select public.bind_inventory_payment(%s,'pi_race_release')", (reservation_id,))
        first = connect()
        try:
            with first.cursor() as cursor:
                cursor.execute(*finalize_args("pi_race_release", [painting], 50000, reservation_id))
            ready = threading.Event()

            def release_after_sale():
                ready.set()
                return query("select public.release_inventory(%s)", (reservation_id,))[0][0]

            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                release_future = pool.submit(release_after_sale)
                assert ready.wait(timeout=3)
                first.commit()
                assert release_future.result(timeout=6)["status"] == "paid"
        finally:
            first.close()
        assert query("select status from public.paintings where id=%s", (painting,))[0][0] == "sold"
        passed.append("release racing a committed sale cannot reopen stock")

        painting = fixture("anonymous-denied")
        conn = connect()
        try:
            with conn.cursor() as cursor:
                cursor.execute("set local role anon")
                try:
                    cursor.execute(*reserve_args(rid(), [painting]))
                except psycopg2.Error as error:
                    assert error.pgcode == "42501", error
                else:
                    raise AssertionError("Anonymous role could reserve inventory")
            conn.rollback()
        finally:
            conn.close()
        assert query("select status from public.paintings where id=%s", (painting,))[0][0] == "available"
        passed.append("anonymous RPC execution denied by PostgreSQL")

        print(json.dumps({"status": "passed", "cases": len(passed), "checks": passed}, indent=2))
    finally:
        if created:
            with admin.cursor() as cursor:
                cursor.execute(sql.SQL("drop database {} with (force)").format(sql.Identifier(database)))
        admin.close()


if __name__ == "__main__":
    main()
