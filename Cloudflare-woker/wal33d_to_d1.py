#!/usr/bin/env python3
"""Download Wal33D/dtc-database SQLite and emit a Cloudflare D1-compatible SQL dump.
Optional helper: Worker works without this because OBDex + OBDb are live sources.
"""
import argparse, os, sqlite3, urllib.request
from pathlib import Path

URL='https://raw.githubusercontent.com/Wal33D/dtc-database/main/data/dtc_codes.db'

def q(v):
    if v is None: return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def pick(cols, *names):
    low={c.lower():c for c in cols}
    for n in names:
        if n.lower() in low: return low[n.lower()]
    return None

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--db', default='wal33d_dtc_codes.db')
    ap.add_argument('--out', default='wal33d_d1.sql')
    args=ap.parse_args()
    db=Path(args.db)
    if not db.exists():
        print('Downloading',URL)
        urllib.request.urlretrieve(URL, db)
    con=sqlite3.connect(db)
    con.row_factory=sqlite3.Row
    tables=[r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    source=None; mapping=None
    for t in tables:
        cols=[r[1] for r in con.execute(f'PRAGMA table_info("{t}")')]
        code=pick(cols,'code','dtc','dtc_code')
        desc=pick(cols,'description','definition','desc','text')
        if code and desc:
            source=t
            mapping=(code,desc,pick(cols,'manufacturer','make','brand'),pick(cols,'category','type_name','type'),pick(cols,'locale','language'))
            break
    if not source:
        raise SystemExit('Could not locate a DTC table automatically. Tables: '+', '.join(tables))
    code,desc,man,cat,locale=mapping
    fields=[code,desc]+([man] if man else [])+([cat] if cat else [])+([locale] if locale else [])
    sql=f'SELECT {", ".join([f"\"{x}\"" for x in fields])} FROM "{source}"'
    rows=con.execute(sql)
    out=Path(args.out).open('w',encoding='utf-8')
    out.write('DROP TABLE IF EXISTS wal33d_dtc;\n')
    out.write('CREATE TABLE wal33d_dtc (code TEXT NOT NULL, description TEXT, manufacturer TEXT, category TEXT);\n')
    out.write('CREATE INDEX idx_wal33d_code ON wal33d_dtc(code);\nBEGIN TRANSACTION;\n')
    count=0
    for r in rows:
        vals=list(r)
        loc = vals[-1] if locale else None
        if locale and loc and str(loc).lower() not in ('en','en-us','english'):
            continue
        i=0; c=vals[i]; i+=1; d=vals[i]; i+=1
        m=vals[i] if man else None; i+=1 if man else 0
        ca=vals[i] if cat else None
        if not c: continue
        out.write(f'INSERT INTO wal33d_dtc(code,description,manufacturer,category) VALUES ({q(str(c).upper())},{q(d)},{q(m)},{q(ca)});\n')
        count+=1
        if count%500==0:
            out.write('COMMIT;\nBEGIN TRANSACTION;\n')
    out.write('COMMIT;\n')
    out.close(); con.close()
    print(f'Wrote {count} rows to {args.out} from table {source}')

if __name__=='__main__': main()
