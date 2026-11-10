# Staging quick start

Local browser: http://127.0.0.1:5050

Sample login: `owner@rocketfix.local` / `Rocketfix-Staging-2026!`. Other role accounts: `editor@rocketfix.local`, `production@rocketfix.local`, `sales@rocketfix.local`, `admin@rocketfix.local`, `encoder@rocketfix.local`, same emulator-only password.

```sh
npm ci --ignore-scripts
npm ci --prefix functions --ignore-scripts
npm run build
npm run emulators
```

In a second terminal, create sample accounts and explicitly enable synthetic frame fixtures:

```sh
GCLOUD_PROJECT=demo-rocketfix-360 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/seed-emulator.cjs --fixtures
```

Frame prices/shipping in this mode are UNVERIFIED_FIXTURE test inputs, never approved customer quotes. All orders remain staging-only / productionEligible false. Email and Viber remain simulated. Existing employee memberships are preserved by the seed tool.

For a remote staging deployment, copy `staging/project.example.json` to ignored `staging/project.json`, supply the public web configuration for an independently confirmed separate Firebase staging project, and explicitly set `confirmedSeparateStaging` true. Project ID must end in `-staging` or `-staging-<suffix>`. Enable Email/Password Auth and provision private staff memberships there. Authenticate Firebase CLI for that project. Then:

```sh
npm run deploy:staging -- --config staging/project.json --confirm-project YOUR_PROJECT-staging
```

This command validates the explicit project, creates an isolated deployment artifact with its own matching runtime/browser target, checks staging project access and deploys only rules/indexes, Functions and Hosting there. No remote deployment was run here because a separate staging project/configuration was not supplied. No default Firebase project or production data is used. Sending stays disabled in deployed artifacts too.
