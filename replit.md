# CivicPulse on Replit

CivicPulse is a frontend-only civic issue reporting prototype using React, TanStack Start, Vite, and localStorage-backed mock data.

## Run locally in Replit

The `Start application` workflow runs:

```sh
npm run dev -- --host 0.0.0.0 --port 5000
```

Open the Replit Preview to use the app. No external services, API keys, database, or production authentication are required.

## Demo roles

- Citizen: `citizen.demo@example.com`
- Municipal officer: `authority.demo@example.com`
- Administrator: `admin.demo@example.com`

The role selector is demo authentication only. Issue state is centralized in the root page and saved under the `civicpulse-demo` localStorage key so a submitted issue is shared by the citizen dashboard, authority queue, issue detail, map, analytics, and verification flow.

## Main prototype flow

1. Open a demo role from the landing page.
2. As Citizen, create a report with an image, description, location, AI review, duplicate review, and submission.
3. Switch to Municipal Officer, open the report, assign a department/officer, add notes, and submit before/after resolution evidence.
4. Switch back to Citizen and use **Yes, resolved** or **No, still exists** to update the same issue.

All AI analysis, maps, notifications, analytics, and service responses are simulated locally so they can be replaced by backend services later.
