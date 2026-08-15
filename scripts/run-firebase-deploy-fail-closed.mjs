import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ANSI_ESCAPE_PATTERN = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const FIREBASE_SUCCESS_PATTERN = /\bDeploy\s+complete\s*!/i;

export function normalizeFirebaseOutput(output) {
  return String(output ?? '')
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(CONTROL_CHARACTER_PATTERN, '')
    .replace(/\s+/g, ' ');
}

export function evaluateFirebaseDeployResult(exitCode, output) {
  const completionMarkerFound = FIREBASE_SUCCESS_PATTERN.test(
    normalizeFirebaseOutput(output),
  );

  if (exitCode !== 0) {
    return {
      exitCode: Number.isInteger(exitCode) && exitCode > 0 ? exitCode : 1,
      reason: `firebase deploy exited with code ${exitCode ?? 'unknown'}`,
      completionMarkerFound,
    };
  }

  return { exitCode: 0, reason: null, completionMarkerFound };
}

export async function runFirebaseDeployFailClosed(command, args, options = {}) {
  const outputTarget = options.stdout ?? process.stdout;
  const errorTarget = options.stderr ?? process.stderr;

  return new Promise(resolve => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
    });
    let output = '';

    const capture = (chunk, target) => {
      const text = chunk.toString();
      output += text;
      target?.write(text);
    };

    child.stdout.on('data', chunk => capture(chunk, outputTarget));
    child.stderr.on('data', chunk => capture(chunk, errorTarget));
    child.on('error', error => {
      errorTarget?.write(`Unable to start firebase deploy: ${error.message}\n`);
      resolve({ exitCode: 1, reason: 'firebase deploy could not be started' });
    });
    child.on('close', exitCode => {
      resolve(evaluateFirebaseDeployResult(exitCode, output));
    });
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const separatorIndex = process.argv.indexOf('--');
  const deployCommand = separatorIndex >= 0
    ? process.argv.slice(separatorIndex + 1)
    : [];

  if (deployCommand[0] !== 'firebase' || deployCommand[1] !== 'deploy') {
    console.error('Expected: node scripts/run-firebase-deploy-fail-closed.mjs -- firebase deploy <args>');
    process.exitCode = 1;
  } else {
    const result = await runFirebaseDeployFailClosed(
      deployCommand[0],
      deployCommand.slice(1),
    );

    if (result.exitCode !== 0) {
      console.error(`Firebase deployment failed closed: ${result.reason}.`);
    } else if (!result.completionMarkerFound) {
      console.warn('Firebase deploy exited successfully without a recognizable completion marker.');
    }
    process.exitCode = result.exitCode;
  }
}
