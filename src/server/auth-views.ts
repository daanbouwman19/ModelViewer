/**
 * @file HTML Templates and Views for the Server.
 */

/**
 * Generates the HTML page for the Google Authentication callback.
 * @param safeCode - The escaped authentication code to display.
 * @param nonce - The security nonce for Content Security Policy.
 * @returns The complete HTML string.
 */
export function getGoogleAuthSuccessPage(
  safeCode: string,
  nonce: string,
): string {
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Authentication</title>
          <style>
            body { font-family: sans-serif; background: #222; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .container { background: #333; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-align: center; max-width: 500px; width: 90%; }
            h1 { margin-top: 0; color: #4ade80; }
            p { margin-bottom: 1.5rem; color: #ccc; }
            .code-box { background: #111; padding: 1rem; border: 1px solid #444; border-radius: 4px; font-family: monospace; font-size: 1.2rem; word-break: break-all; margin-bottom: 1.5rem; user-select: all; }
            button { background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 1rem; transition: background 0.2s; }
            button:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Successful</h1>
            <p>Please copy the code below and paste it into the Media Player application.</p>
            <div id="code-box" class="code-box">${safeCode}</div>
            <button id="copy-btn">Copy Code</button>
          </div>
          <script nonce="${nonce}">
            const codeBox = document.getElementById('code-box');
            const copyBtn = document.getElementById('copy-btn');

            if (codeBox) {
              codeBox.addEventListener('click', () => {
                const range = document.createRange();
                range.selectNode(codeBox);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
              });
            }

            if (copyBtn) {
              copyBtn.addEventListener('click', () => {
                if (!codeBox) return;
                const code = codeBox.innerText;
                navigator.clipboard.writeText(code).then(() => {
                  copyBtn.innerText = 'Copied!';
                  setTimeout(() => copyBtn.innerText = 'Copy Code', 2000);
                });
              });
            }
          </script>
        </body>
      </html>
    `;
}
