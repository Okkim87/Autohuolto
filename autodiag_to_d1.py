#!/usr/bin/env python3
"""Luo Autodiag2:n ad_database.sqlite-tiedostosta D1-yhteensopiva SQL-dumppi.
Käyttö: python autodiag_to_d1.py /polku/ad_database.sqlite autodiag_d1.sql
"""
import sqlite3, sys
from pathlib import Path
if len(sys.argv) != 3:
    raise SystemExit('Käyttö: python autodiag_to_d1.py ad_database.sqlite autodiag_d1.sql')
src, dst = map(Path, sys.argv[1:])
con = sqlite3.connect(src)
con.row_factory = sqlite3.Row
cur = con.cursor()
need = ['ad_manufacturer','ad_ecu','ad_dtc']
existing = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
missing = [x for x in need if x not in existing]
if missing:
    raise SystemExit('Puuttuvat taulut: '+', '.join(missing))

def cols(table):
    return [r[1] for r in cur.execute(f'PRAGMA table_info({table})')]

def q(v):
    if v is None: return 'NULL'
    if isinstance(v,(int,float)): return str(v)
    return "'"+str(v).replace("'","''")+"'"

with dst.open('w', encoding='utf-8') as f:
    f.write('PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n')
    # Preserve only the fields used by the Worker. This keeps D1 much smaller.
    f.write('CREATE TABLE IF NOT EXISTS ad_manufacturer (id INTEGER PRIMARY KEY, name TEXT);\n')
    f.write('CREATE TABLE IF NOT EXISTS ad_ecu (id INTEGER PRIMARY KEY, manufacturer_id INTEGER, model TEXT);\n')
    f.write('CREATE TABLE IF NOT EXISTS ad_dtc (id INTEGER PRIMARY KEY, ecu_id INTEGER, code TEXT, definition TEXT, description TEXT);\n')
    mc=set(cols('ad_manufacturer')); ec=set(cols('ad_ecu')); dc=set(cols('ad_dtc'))
    for r in cur.execute('SELECT * FROM ad_manufacturer'):
        f.write(f"INSERT OR REPLACE INTO ad_manufacturer(id,name) VALUES({q(r['id'])},{q(r['name'] if 'name' in mc else None)});\n")
    for r in cur.execute('SELECT * FROM ad_ecu'):
        f.write(f"INSERT OR REPLACE INTO ad_ecu(id,manufacturer_id,model) VALUES({q(r['id'])},{q(r['manufacturer_id'] if 'manufacturer_id' in ec else None)},{q(r['model'] if 'model' in ec else None)});\n")
    for r in cur.execute('SELECT * FROM ad_dtc'):
        f.write(f"INSERT OR REPLACE INTO ad_dtc(id,ecu_id,code,definition,description) VALUES({q(r['id'])},{q(r['ecu_id'] if 'ecu_id' in dc else None)},{q(r['code'] if 'code' in dc else None)},{q(r['definition'] if 'definition' in dc else None)},{q(r['description'] if 'description' in dc else None)});\n")
    f.write('CREATE INDEX IF NOT EXISTS idx_dtc_code ON ad_dtc(code);\n')
    f.write('CREATE INDEX IF NOT EXISTS idx_ecu_manufacturer ON ad_ecu(manufacturer_id);\nCOMMIT;\n')
print(dst)
