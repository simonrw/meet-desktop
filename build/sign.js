// @ts-check
const { execFileSync } = require("node:child_process");
const { signAsync } = require("@electron/osx-sign");

// SHA-1 of the self-signed release certificate. electron-builder can't find it by name because macOS doesn't trust it.
const RELEASE_IDENTITY = "496b29d9c46fd62f6523cced452c5a1729b62029";

/**
 * electron-builder's `mac.sign` hook. Signs with the release certificate when electron-builder imported `CSC_LINK` into
 * a keychain, and ad-hoc otherwise. On CI it then fails unless the app satisfies the release designated requirement.
 *
 * electron-builder only calls this hook because `mac.identity` is `"-"`, which is undocumented behaviour, so re-check it
 * when upgrading electron-builder.
 *
 * @param {import("@electron/osx-sign").SignOptions} opts
 */
module.exports = async function sign(opts) {
  const identity = opts.keychain ? RELEASE_IDENTITY : "-";
  await signAsync({ ...opts, identity, identityValidation: false });

  if (process.env.CI) {
    verifyReleaseSignature(opts.app);
  }
};

/**
 * @param {string} app
 */
function verifyReleaseSignature(app) {
  try {
    execFileSync(
      "codesign",
      ["--verify", "--deep", "--strict", `-R=certificate leaf = H"${RELEASE_IDENTITY}"`, app],
      { stdio: "pipe" },
    );
  } catch (error) {
    const reason = error instanceof Error && "stderr" in error ? String(error.stderr).trim() : String(error);
    throw new Error(`${app} isn't signed with the release certificate: ${reason}`);
  }
}
