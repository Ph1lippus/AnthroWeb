# AnthroWeb

A comprehensive daily tracking application that helps you monitor your health, habits, goals, and more. Track everything from sleep and vitals to workouts, books, and personal projects.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

### Daily Tracking
- **Sleep** - Wake time, bedtime, auto-calculated duration
- **Vitals** - Blood pressure, heart rate & body temperature (morning + evening)
- **Body Metrics** - Weight & body fat percentage
- **Nutrition** - Calories, protein, carbs, fat, water intake
- **Habits** - Daily habit checklist (routines, reading, coding, journaling, stretching, language study, and more)
- **Daily Score** - Weighted daily score computed from every metric

### Weekly Body Measurements
- Full body measurement log (neck, shoulders, chest, arms, waist, hips, legs, and more)
- Auto-computed ratios & indices: Waist-Hip Ratio, WHtR, FFMI, Adonis Index, BMR, Lean Body Mass, Muscle Quality, and others
- Trend charts for every metric over time

### Goals & Gamification
- Per-metric goal setting with progress bars
- Badges & achievements for streaks (habits, workouts, reading, daily score)

### Books
- Book list with last-page-read tracking and progress percentage
- Personal ratings and reading statistics

### Workouts
- Workout logging (type, duration, exercises, sets/reps/weight)
- Calendar heatmap of workout days

### Projects
- Personal project tracker with periodic reminders and progress tracking

### Academic / Grading
- Course/subject tracking with weighted grades and a running average

### Dashboards
- Overview dashboard with score, streaks, and key metrics
- Correlation charts (e.g. sleep duration vs. next-day score)
- Habit-streak and workout calendars
- Weekly/monthly summary reports

### Platform
- Installable PWA — works offline, add to home screen
- Optional API integration with a companion study-timer app to auto-fill the "Studied" metric

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