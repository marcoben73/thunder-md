#!/usr/bin/env bash
# Creates a throwaway Thunderbird profile for automated testing and starts
# Thunderbird on it with the devtools server enabled.
#
#   scripts/test-profile.sh create [dir]   # build the profile (default .tbtest/profile)
#   scripts/test-profile.sh run [dir]      # start Thunderbird on it (port 6000)
#   scripts/test-profile.sh reset [dir]    # delete and rebuild
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMD="${1:-create}"
PROFILE="${2:-$ROOT/.tbtest/profile}"
PORT="${TB_DEBUG_PORT:-6000}"
BIN="${THUNDERBIRD_BIN:-thunderbird}"

create_profile() {
  mkdir -p "$PROFILE/Mail/Local Folders"
  cat > "$PROFILE/user.js" <<'PREFS'
// devtools server (RDP)
user_pref("devtools.debugger.remote-enabled", true);
user_pref("devtools.debugger.prompt-connection", false);
user_pref("devtools.chrome.enabled", true);
user_pref("devtools.debugger.force-local", true);
// quiet first run
user_pref("mail.shell.checkDefaultClient", false);
user_pref("mail.provider.suppress_dialog_on_startup", true);
user_pref("mail.rights.version", 1);
user_pref("mail.spotlight.firstRunDone", true);
user_pref("mailnews.start_page.enabled", false);
user_pref("app.update.auto", false);
user_pref("app.update.enabled", false);
user_pref("extensions.update.enabled", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("app.donation.eoy.version.viewed", 999);
user_pref("mail.compose.attachment_reminder", false);
user_pref("mail.SpellCheckBeforeSend", false);
user_pref("mail.warn_on_send_accel_key", false);
user_pref("xpinstall.signatures.required", false);
// account: Local Folders with an identity; SMTP points to a closed port so
// that sending fails (exercises the restore-after-failed-send path)
user_pref("mail.accountmanager.accounts", "account1");
user_pref("mail.accountmanager.defaultaccount", "account1");
user_pref("mail.accountmanager.localfoldersserver", "server1");
user_pref("mail.account.account1.server", "server1");
user_pref("mail.account.account1.identities", "id1");
user_pref("mail.server.server1.type", "none");
user_pref("mail.server.server1.hostname", "Local Folders");
user_pref("mail.server.server1.name", "Local Folders");
user_pref("mail.server.server1.userName", "nobody");
user_pref("mail.server.server1.directory-rel", "[ProfD]Mail/Local Folders");
user_pref("mail.identity.id1.fullName", "ThunderMD Test");
user_pref("mail.identity.id1.useremail", "test@example.invalid");
user_pref("mail.identity.id1.valid", true);
user_pref("mail.identity.id1.compose_html", true);
user_pref("mail.identity.id1.smtpServer", "smtp1");
user_pref("mail.identity.id1.fcc", false);
user_pref("mail.identity.id1.draft_folder", "mailbox://nobody@Local%20Folders/Drafts");
user_pref("mail.smtpservers", "smtp1");
user_pref("mail.smtpserver.smtp1.hostname", "127.0.0.1");
user_pref("mail.smtpserver.smtp1.port", 2525);
user_pref("mail.smtpserver.smtp1.authMethod", 1);
user_pref("mail.smtpserver.smtp1.try_ssl", 0);
user_pref("mail.smtpserver.smtp1.username", "");
PREFS

  cat > "$PROFILE/Mail/Local Folders/Inbox" <<'MBOX'
From - Mon Nov 02 10:00:00 2026
X-Mozilla-Status: 0001
X-Mozilla-Status2: 00000000
Message-ID: <html-1@example.invalid>
Date: Mon, 2 Nov 2026 10:00:00 +0100
From: Alice <alice@example.invalid>
To: ThunderMD Test <test@example.invalid>
Subject: HTML test message
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 8bit

<html><body>
<h1>Project update</h1>
<p>Hello <strong>team</strong>, this is <em>important</em>. See <a href="https://example.invalid/docs">the docs</a>.</p>
<ul><li>first item</li><li>second item</li></ul>
<ol><li>step one</li><li>step two</li></ol>
<pre><code>npm test
npm run build</code></pre>
<table><tr><th>Name</th><th>Value</th></tr><tr><td>alpha</td><td>1</td></tr><tr><td>beta</td><td>2</td></tr></table>
<blockquote>A quoted sentence.</blockquote>
<p>Regards,<br>Alice</p>
</body></html>

From - Mon Nov 02 11:00:00 2026
X-Mozilla-Status: 0001
X-Mozilla-Status2: 00000000
Message-ID: <plain-1@example.invalid>
Date: Mon, 2 Nov 2026 11:00:00 +0100
From: Bob <bob@example.invalid>
To: ThunderMD Test <test@example.invalid>
Subject: Plain text test message
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8; format=flowed
Content-Transfer-Encoding: 8bit

Hi,

# Not a heading, just text with a hash

Bob wrote:
> quoted line one
> quoted line two

- bullet a
- bullet b

Bye,
Bob

MBOX
  echo "profile created at $PROFILE"
}

case "$CMD" in
  create)
    create_profile
    ;;
  reset)
    rm -rf "$PROFILE"
    create_profile
    ;;
  run)
    [ -f "$PROFILE/user.js" ] || create_profile
    exec "$BIN" --profile "$PROFILE" --no-remote --start-debugger-server "$PORT"
    ;;
  *)
    echo "usage: $0 create|run|reset [profile-dir]" >&2
    exit 1
    ;;
esac
