import {
  getCopilotUsage
} from "./chunk-OHHBYIL4.js";
import {
  HTTPError,
  activateAndClearNeedsReauthInDefaultRegistry,
  cacheModels,
  createTeeLogger,
  listAccounts,
  markNeedsReauthInDefaultRegistry,
  markSignedIn,
  readDefaultRegistry,
  setupCopilotToken,
  stopCopilotRefreshLoop
} from "./chunk-UQM4JUWE.js";
import {
  clearLastUpstreamRejection,
  clearTokenTrio,
  emitAuthChanged,
  setGithubToken,
  setUserName
} from "./chunk-4JX7327A.js";

// src/lib/auth/copilot-preflight.ts
async function preflightCopilotError(token, login, usage = getCopilotUsage) {
  try {
    await usage(token);
    return null;
  } catch (error) {
    const status = error instanceof HTTPError ? error.response.status : 0;
    if (status === 401) {
      return `GitHub rejected ${login}'s token \u2014 it may be expired or revoked. Run \`gh auth login\` and try again, or sign in with a code.`;
    }
    if (status === 403 || status === 404) {
      return `${login} doesn't have access to GitHub Copilot. Pick another account, or sign in with a code.`;
    }
    return `Couldn't verify ${login} with GitHub${status ? ` (HTTP ${status})` : ""}. Check your connection and try again.`;
  }
}

// src/lib/auth/auth-recovery.ts
var log = createTeeLogger("auth");
var flagBad = (key, message) => markNeedsReauthInDefaultRegistry(key, {
  status: null,
  message,
  at: (/* @__PURE__ */ new Date()).toISOString()
});
var setupCopilot = setupCopilotToken;
var preflight = preflightCopilotError;
var refreshModels = cacheModels;
async function switchActiveAccountLive(rec) {
  setGithubToken(rec.token);
  setUserName(rec.login);
  stopCopilotRefreshLoop();
  await setupCopilot({ onAuthFatal: "throw" });
  await activateAndClearNeedsReauthInDefaultRegistry(rec.key);
  try {
    await refreshModels();
  } catch (err) {
    log.warn(
      "Auto-recovery: model refresh failed after switch (continuing):",
      err
    );
  }
  clearLastUpstreamRejection();
  markSignedIn(rec.login);
  emitAuthChanged();
}
async function activateAccountLive(accountKeyToActivate) {
  const reg = await readDefaultRegistry();
  if (!(accountKeyToActivate in reg.accounts)) {
    return {
      ok: false,
      status: 404,
      message: `No account ${accountKeyToActivate}.`
    };
  }
  const record = reg.accounts[accountKeyToActivate];
  const preErr = await preflight(record.token, record.login);
  if (preErr) return { ok: false, status: 422, message: preErr };
  try {
    await switchActiveAccountLive({ ...record, key: accountKeyToActivate });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      status: 422,
      message: err instanceof Error ? err.message : String(err)
    };
  }
}
async function attemptAutoRecovery() {
  const reg = await readDefaultRegistry();
  const candidates = listAccounts(reg).filter(
    (a) => !a.active && !a.needsReauth
  );
  for (const cand of candidates) {
    const preErr = await preflight(cand.token, cand.login);
    if (preErr) {
      await flagBad(cand.key, preErr);
      continue;
    }
    try {
      await switchActiveAccountLive(cand);
      log.info(`Auto-recovery: switched to ${cand.login}.`);
      return true;
    } catch (err) {
      log.warn(
        `Auto-recovery: ${cand.login} failed on live switch; trying next.`,
        err
      );
      await flagBad(cand.key, err instanceof Error ? err.message : String(err));
    }
  }
  clearTokenTrio();
  return false;
}

export {
  preflightCopilotError,
  activateAccountLive,
  attemptAutoRecovery
};
