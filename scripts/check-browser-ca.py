#!/usr/bin/env python3
"""Read-only diagnostic for the managed test environment's Chromium NSS trust.

Never disables TLS verification or imports arbitrary certificates. Trust changes,
if required, must be reviewed separately for the provided environment CA.
"""
import hashlib
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import sys

ca = Path('/usr/local/share/ca-certificates/environment-proxy-ca.crt')
db = Path.home() / '.pki' / 'nssdb'
if not ca.is_file() or not db.is_dir() or not shutil.which('certutil'):
    sys.exit('Managed environment CA, user NSS DB, or certutil is unavailable; no trust settings changed.')
subprocess.run(['openssl', 'verify', '-CAfile', '/etc/ssl/certs/ca-certificates.crt', str(ca)], check=True)
constraints = subprocess.check_output(['openssl', 'x509', '-in', str(ca), '-noout', '-ext', 'basicConstraints'], text=True)
if 'CA:TRUE' not in constraints:
    sys.exit('Provided certificate is not a CA; no trust settings changed.')
fingerprint = hashlib.sha256(ssl.PEM_cert_to_DER_cert(ca.read_text())).hexdigest()
print('Environment CA SHA-256:', fingerprint)
listing = subprocess.check_output(['certutil', '-L', '-d', 'sql:' + str(db)], text=True)
for line in listing.splitlines():
    match = re.match(r'^(.+?)\s+([A-Za-z]*,[A-Za-z]*,[A-Za-z]*)\s*$', line)
    if not match:
        continue
    nickname, trust = match.groups()
    cert = subprocess.run(['certutil', '-L', '-d', 'sql:' + str(db), '-n', nickname, '-a'], capture_output=True, text=True, check=True)
    digest = hashlib.sha256(ssl.PEM_cert_to_DER_cert(cert.stdout)).hexdigest()
    if digest == fingerprint and 'C' in trust.split(',')[0]:
        print('Chromium user NSS SSL CA trust verified:', nickname, trust)
        print('No trust-store changes or TLS verification bypass required.')
        break
else:
    sys.exit('Provided CA is not trusted for SSL in this user NSS DB; ask the environment administrator to enroll this verified CA. No settings changed.')

# Chromium initializes NSS/SQLite read-write, even when merely reading CA trust.
# Directory writes are needed for SQLite lock/journal files, not new CA trust.
paths=[db,db/'cert9.db',db/'key4.db']
if not all(os.access(path,os.W_OK) for path in paths):
    sys.exit('CA is trusted, but Chromium cannot initialize the NSS DB read-write. Grant the test process write access only to '+str(db)+'; do not disable TLS or re-enroll the same CA.')
print('Chromium NSS SQLite read/write access: ready.')
