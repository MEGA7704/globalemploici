from pathlib import Path
import subprocess, sys
root=Path(__file__).resolve().parents[1]
checks=[
    ['python3',str(root/'scripts'/'verify_route_contracts.py')],
    ['node',str(root/'scripts'/'test_v31_no_runtime_bootstrap.mjs')],
]
for cmd in checks:
    r=subprocess.run(cmd,cwd=root,text=True)
    if r.returncode: sys.exit(r.returncode)
print('V31 PAGE/API SMOKE SUITE OK')
