# AnthroWeb

A comprehensive daily tracking application that helps you monitor your health, habits, goals, and more. Track everything from sleep and vitals to workouts, books, and personal projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

### Daily Tracking - Doing
- **Sleep** - Wake time, bedtime, auto-calculated duration
- **Vitals** - Blood pressure, heart rate & body temperature (morning + evening)
- **Body Metrics** - Weight & body fat percentage - These are optional and do not affect the daily score.
- **Nutrition** - Calories, protein, carbs, fat, water intake
- **Habits** - Daily habit checklist (routines, reading, coding, journaling, stretching, language study, and more)
- **Daily Score** - Weighted daily score computed from every metric

### Weekly Body Measurements
- Full body measurement log (neck, shoulders, chest, arms, waist, hips, legs, and more)
- Auto-computed ratios & indices: Waist-Hip Ratio, WHtR, FFMI, Adonis Index, BMR, Lean Body Mass, Muscle Quality, and others
- Trend charts for every metric over time

### Books - Done
- Book list with last-page-read tracking and progress percentage
- Personal ratings and reading statistics

### Workouts
- Workout logging (type, duration, exercises, sets/reps/weight)
- Calendar heatmap of workout days

### Projects - Done
- Personal project tracker with periodic reminders and progress tracking

### Academic / Grading
- Course/subject tracking with weighted grades and a running average

### Dashboards
- Overview dashboard with score, streaks, and key metrics
- Correlation charts (e.g. sleep duration vs. next-day score)
- Habit-streak and workout calendars
- Weekly/monthly summary reports

### Abstinence - Done
- 

### Platform
- Installable PWA — Can add to home screen
- Native Android app via Capacitor — side-loaded APK with built-in in-app updates
- API integration with a companion study-timer app to help with studies. 

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (Postgres + Auth + Row Level Security) |
| Hosting | Vercel |
| Charts | Recharts |
| PWA | Workbox / Service Worker |

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/Ph1lippus/AnthroWeb.git

# Navigate to the project directory
cd AnthroWeb

# Install dependencies
npm install

# Set up environment variables
# Edit .env file with your Supabase credentials:
# VITE_SUPABASE_URL=your-supabase-url
# VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Start development server
npm run dev
```

### Building for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Android App (Capacitor)

The app is wrapped as a native Android app using [Capacitor](https://capacitorjs.com). Releases are built as signed APKs by the GitHub Actions workflow and distributed through GitHub Releases.

### Install for the first time

1. Open the [Releases](https://github.com/Ph1lippus/AnthroWeb/releases) page and download the latest APK (`anthroweb-app-release.apk` or similar) from the newest release.
2. On your phone, open the downloaded APK.
3. The first time, Android will ask you to allow "Install unknown apps" for the app you're opening the file from (e.g. your browser or file manager). Tap **Settings** and enable it, then go back.
4. Tap **Install** and confirm. AnthroWeb will appear in your app drawer.

> **Note:** The signed release APK cannot be installed on top of a locally-built debug APK (different signatures). If you previously installed a debug build from Android Studio, uninstall it first.

### Run locally from source

```bash
npm install
npm run build
npx cap sync android
```

Then open the `android/` folder in Android Studio and press **Run**, or from the CLI:

```bash
cd android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Publish a new release (with in-app update)

1. **Just push to `main`.** The **Build Android APK** workflow runs automatically, auto-bumps the patch version from the latest release (e.g. `1.0.0` → `1.0.1`), builds a signed APK, tags it `vX.Y.Z`, and creates a GitHub Release.
2. Want a specific version instead? Run the **Build Android APK** workflow from GitHub Actions with a `version` input (e.g. `1.1.0`).
3. Existing installs pick it up automatically:
   - **Auto-check:** AnthroWeb checks for a newer GitHub release every time the app opens (and when it resumes), and shows an *Update Available* dialog.
   - **Manual check:** on the Settings screen, tap **Check for Updates**, then **Update & Install**.
4. The APK downloads in-app and hands off to the Android installer — you just confirm the install the first time you allow "Install unknown apps" for AnthroWeb.

> **Signing:** with `KEYSTORE_BASE64`/`KEYSTORE_PASSWORD`/`KEY_ALIAS`/`KEY_PASSWORD` secrets set, the APK is signed with your production keystore. Without them, the workflow falls back to a debug-signed APK (also installable). Switching between the two signing modes requires uninstalling the old APK first (signature mismatch).

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
