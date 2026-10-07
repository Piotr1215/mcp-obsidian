/**
 * The vault root itself: resolving the path the server was started with, and
 * telling an unreadable vault apart from an empty one.
 */

import { readdir } from 'fs/promises';
import path from 'path';

/**
 * Expands a leading ~ to the home directory (pure function). MCP clients start
 * the server without a shell, so "~/vault" arrives as written.
 * @param {string} vaultPath - Vault path as given on the command line
 * @param {string} home - The home directory
 * @returns {string} The path with ~ expanded
 */
export function expandHomePath(vaultPath, home) {
  if (vaultPath === '~') {
    return home;
  }
  if (vaultPath.startsWith('~/')) {
    return path.join(home, vaultPath.slice(2));
  }
  return vaultPath;
}

/**
 * Explains a failure to read the vault root and how to fix it (pure function)
 * @param {string} vaultPath - The vault root
 * @param {Error} error - The error from reading it
 * @returns {string} Message naming the cause and the fix
 */
export function describeVaultError(vaultPath, error) {
  switch (error.code) {
    case 'ENOENT':
      return `Vault not found at "${vaultPath}". Check the vault path the server was started with; ` +
        'MCP clients pass it as written, without expanding environment variables.';
    case 'ENOTDIR':
      return `Vault path "${vaultPath}" is a file, not a folder. Start the server with the vault folder.`;
    case 'EACCES':
    case 'EPERM':
      return `Cannot read the vault at "${vaultPath}" (${error.code}). The folder exists but this process is not allowed to open it. ` +
        'On macOS, a vault in iCloud Drive, Documents or Desktop needs the app that starts this server, such as Claude or your terminal, ' +
        'to have access under System Settings > Privacy & Security > Files and Folders, or Full Disk Access.';
    default:
      return `Cannot read the vault at "${vaultPath}": ${error.message}`;
  }
}

/**
 * Throws when the vault root cannot be read. glob treats an unreadable
 * directory as an empty one, so without this a missing vault or a denied
 * permission reports zero notes instead of an error.
 *
 * The error is a plain Error, not an MCPError, so the server returns it as a
 * tool result with isError: it is an execution failure the model should read
 * and relay, not a malformed request.
 * @param {string} vaultPath - The vault root
 */
export async function assertVaultReadable(vaultPath) {
  try {
    await readdir(vaultPath);
  } catch (error) {
    throw Object.assign(new Error(describeVaultError(vaultPath, error)), { code: error.code, path: vaultPath });
  }
}
