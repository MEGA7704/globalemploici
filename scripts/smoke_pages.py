from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parents[1]
for script in ['test_legacy_import_v27.mjs','test_full_v26_upgrade_v27.mjs','integration_worker_v27.mjs']:
    r=subprocess.run(['node',str(root/'scripts'/script)],cwd=root,text=True)
    if r.returncode: sys.exit(r.returncode)
print('V27 PAGE/API SMOKE SUITE OK')
