from pathlib import Path
root=Path(__file__).resolve().parents[1]
app=(root/'public/app.js').read_text()
worker=(root/'src/_worker.js').read_text()
styles=(root/'public/styles.css').read_text()
assert 'candidateLatestBirthDate' in app
assert 'isCandidateAdultBirthDate' in app
assert '18 ANS MINIMUM' in app
assert 'strictement réservée aux personnes âgées de 18 ans ou plus' in app
assert 'max="${candidateLatestBirthDate()}"' in app
assert 'candidateAgeFromBirthDate' in worker
assert 'candidateIsAdult' in worker
assert 'CANDIDATE_MINIMUM_AGE_18' in worker
assert "role==='candidate' && !candidateIsAdult(b.birth_date)" in worker
assert '.age-restriction-notice' in styles
print('V40_CANDIDATE_MINIMUM_AGE_18_OK')
