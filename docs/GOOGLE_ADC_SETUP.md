# Use your Google sign-in with Jinni

**ADC means Application Default Credentials.** In everyday terms, you sign in to Google on your computer once, and the Python backend uses that sign-in to call Vertex AI. It is not an API key to copy or a file to upload to Jinni.

Jinni now has a separate **Google Vertex AI (ADC)** provider. The existing **Google Gemini** option still uses a Gemini Developer API key. Choose Vertex AI to use your Google Cloud project and any eligible Cloud trial credits.

## 1. Find your Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) with the account that received the trial credits.
2. Use the project selector at the top. Select an existing project, or create one if necessary.
3. Copy its **Project ID**, such as `my-trial-project`. Use the ID, not its friendly display name or project number.
4. In **Billing**, confirm that this project is linked to the billing account showing your trial credits. Signing in does not itself attach credits to a project.

Google decides trial eligibility, model availability, API permissions and quota. ADC does not bypass those restrictions. Jinni does not upgrade your billing account or guarantee free usage. Model requests can use credits or incur charges under your account's terms. Check the project's usage and credits before making model calls; billing budget alerts are notifications, not spending caps. The app's **Check Google sign-in** action does not generate an AI answer.

## 2. Install Google Cloud CLI

Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install). On Windows, use Google's Windows installer and reopen PowerShell after installation. Confirm it is available:

```powershell
gcloud --version
```

## 3. Sign in and enable Vertex AI

In PowerShell or your terminal, run the following. Replace `YOUR_PROJECT_ID` with the project ID you copied; do not include angle brackets.

```powershell
gcloud init
gcloud config set project YOUR_PROJECT_ID
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

The login commands open your browser. Choose the Google account that can access the project and approve the Cloud CLI sign-in. `gcloud init` signs in the command-line tool; `gcloud auth application-default login` separately creates the ADC used by applications. They are not interchangeable.

Google normally stores local ADC at `%APPDATA%\gcloud\application_default_credentials.json` on Windows or `~/.config/gcloud/application_default_credentials.json` on Linux/macOS. **You do not need to open, copy, send or upload that file.** It contains private credentials. Jinni discovers it through Google's authentication library and obtains short-lived access tokens in the backend. Credential files and tokens never enter its renderer, chat JSON, source library or settings storage. The common ADC filename is ignored by Git as an additional precaution.

If Google denies API activation, the project's administrator must enable Vertex AI. For ordinary inference and project quota usage, the account generally needs **Vertex AI User** (`roles/aiplatform.user`) and **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) on the project. Enabling services itself requires the appropriate service-management permission. Organisation, trial and model restrictions may still apply. Do not grant broad Owner access just to avoid diagnosing a permission error.

## 4. Update and open Jinni

From the repository root:

```powershell
uv sync --locked
npm ci
npm run desktop
```

On Windows, after installing dependencies, you can also use `start-my-jinni.cmd`. Restart an already-running app and any separately managed Python backend to load the new dependency and provider. Leave normal data-directory settings unchanged to preserve your library.

1. Open **AI settings** from the header or the visible Ask AI panel.
2. Choose **Google Vertex AI (ADC)**.
3. Enter your **Project ID**.
4. Use **Location** `global`, or a supported region such as `europe-west2` that serves your chosen model. Global is a routing option, not a promise about regional data residency.
5. Click **Check Google sign-in**. A success means the backend can obtain a Google access token. It does **not** prove model access, billing eligibility or quota. No model call is made by this button.
6. Choose a suggested Gemini model, or choose **Custom model** and enter a **model ID currently available in Vertex AI Studio for your project/location**. Jinni intentionally starts without a selected Vertex model: suggestions are not an account-access check. Copy a model ID, not a display name or a full URL.
7. Close settings. In the visible **Ask AI** panel, tick **Include my current comparison**, enter a question and click **Ask**. This action sends the question and selected evidence to Google and can consume model credits.

Try: “Explain why this option ranked first. Show its price in £, its travel time and the main trade-offs. Cite the calculated evidence.”

Project ID and location are nonsecret preferences remembered in the local UI when storage is available. Model choices remain session-only. API-key fields are hidden for Vertex AI. Other providers keep their separate session keys; selecting Vertex AI never borrows or forwards those keys. Comparison, source and question changes clear stale AI results.

The backend recalculates the actual comparison, supplies the criteria's units, priorities, limits and evidence, then checks Google's structured answer and exact quotations. The calculated result remains authoritative. A valid quote does not prove every sentence is true. Built-in datasets remain fictional.

## 5. Optional checks from the terminal

Check sign-in without generating an answer:

```powershell
uv run python -m scripts.verify_vertex --project YOUR_PROJECT_ID --location global
```

Only when ready to make **one model request**, replace `YOUR_MODEL_ID` with an available model and run:

```powershell
uv run python -m scripts.verify_vertex --project YOUR_PROJECT_ID --location global --model YOUR_MODEL_ID --ask
```

The second command uses the real fictional travel comparison and asks Google for a cited explanation. It can consume trial credits or incur a normal model charge. Both commands use temporary library storage and print safe status information, not access tokens, credential files or raw answers. A successful example is not proof of accuracy for every question or of a complete desktop usability review.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `gcloud` not recognised | Install Google Cloud CLI and reopen your terminal. |
| Google sign-in not found/expired | Run `gcloud auth application-default login` on the same computer/account running the backend. |
| ADC works in a terminal but not Jinni | Check that both run as the same operating-system user. A separately running backend uses its own user's credentials. An explicit `GOOGLE_APPLICATION_CREDENTIALS` variable can override the normal local ADC location; do not point it to an unrelated or untrusted file. |
| Invalid Project ID | Copy the ID from Cloud Console. It normally contains lowercase letters, digits and hyphens. |
| Permission denied / `ADC_AUTH_ERROR` | Check project access, Vertex API activation, required roles and billing/trial eligibility. Repeatedly creating keys will not fix an IAM or organisation restriction. |
| `AI_REQUEST_ERROR` | Check the exact model ID and its supported location in Vertex AI Studio. Jinni does not fall back to another model. |
| `AI_RATE_LIMITED` | Check Google project quotas, capacity, trial restrictions and available credits. |
| `AI_TIMEOUT` / `AI_UNAVAILABLE` | Check network access and Google availability, then retry. Ordinary comparisons remain available. |
| Insufficient evidence | Include your current comparison or select notes/files containing the answer. |
| `INVALID_AI_RESPONSE` | The response was incomplete or failed structured-output/quote checks. It is not shown as a valid cited answer. |

To revoke local ADC later, run `gcloud auth application-default revoke`. This affects other local applications using the same ADC, not just Jinni. It does not clear a separate OpenAI/Gemini API key stored for a Jinni session.

The GitHub Pages edition remains a static, keyless comparison/text-search app. ADC support runs in the desktop backend; no credential file should be added to the website.

Official references: [local ADC](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment), [quota project](https://cloud.google.com/docs/quotas/set-quota-project), [Vertex AI authentication](https://cloud.google.com/vertex-ai/docs/authentication), [Vertex AI Studio](https://console.cloud.google.com/vertex-ai/studio), [Cloud Free Program](https://cloud.google.com/free/docs/free-cloud-features).
