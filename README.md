# 🏥 MediFlow - Smart Hospital Queue & Real-Time Patient Management System

MediFlow is an enterprise-grade hospital queue management and appointment scheduling platform designed to eliminate physical waiting room congestion. The system provides seamless real-time queue synchronization, native push notifications, doctor consult management, and live tracking across mobile and web interfaces.

---

## 🌟 Key Features

- ⚡ **Real-Time Live Queue Tracking**: Powered by WebSocket (STOMP / SockJS) for sub-second token updates and queue status broadcasts.
- 📲 **Native Push Notifications**: Expo Push Notification integration delivering instant alerts on token calls, delays, and appointment reminders even when the app is backgrounded or closed.
- 🔐 **Secure Role-Based Authentication**: JWT-based security with roles for Patients, Staff, Doctors, and Administrators.
- 📊 **Executive & Doctor Analytics Dashboard**: Real-time patient throughput, average wait times, active doctor loads, and department metrics.
- 📱 **Cross-Platform Patient Mobile App**: Built with React Native & Expo Router with dark-mode aesthetic, offline tolerance, and haptic feedback.
- 💻 **Web Admin & Doctor Calling Portal**: Zero-refresh token calling, patient check-in, priority token escalations, and schedule management.

---

## 🏗️ Architecture & Tech Stack

```
                                 ┌─────────────────────────────┐
                                 │   Patient Mobile App (Expo) │
                                 └──────────────┬──────────────┘
                                                │ REST / STOMP / Push
                                                ▼
┌───────────────────────────┐    ┌─────────────────────────────┐    ┌───────────────────────────┐
│ Web Admin & Doctor Portal │───▶│  Spring Boot Backend (REST) │◀───│     Patient Web Portal    │
└───────────────────────────┘    │  WebSocket (STOMP Engine)   │    └───────────────────────────┘
                                 └──────────────┬──────────────┘
                                                │
                                                ▼
                                 ┌─────────────────────────────┐
                                 │       MongoDB Database      │
                                 └─────────────────────────────┘
```

| Layer | Technologies |
|---|---|
| **Backend** | Java 17, Spring Boot 3, Spring Security, Spring Data MongoDB, STOMP / WebSocket, JWT |
| **Mobile App** | React Native, Expo 54, Expo Router, TypeScript, Expo Notifications, Expo SecureStore |
| **Web Admin & Patient Web** | HTML5, CSS3 (Glassmorphic Design), Vanilla JavaScript (ES6+), SockJS / STOMP.js |
| **Database** | MongoDB (Document Storage & Auto-Indexing) |
| **Push Gateway** | Expo Push Notification Service (FCM / APNs) |

---

## 📁 Repository Structure

```
.
├── backend/                  # Spring Boot 3 Java Backend
│   ├── src/main/java/        # Controllers, Services, Repositories, Models, Configs
│   ├── src/main/resources/   # application.properties & resources
│   └── pom.xml               # Maven dependencies
├── patient-app-mobile/       # React Native / Expo Mobile App for Patients
│   ├── app/                  # Expo Router file-based screens & tabs
│   ├── utils/                # API client, WebSocket STOMP client, Push Notifications
│   └── app.json              # Expo application configuration & plugins
├── web-admin/                # Admin & Doctor Management Web Dashboard
│   ├── index.html            # Main Admin Dashboard UI
│   ├── login.html            # Admin / Staff Authentication
│   └── app.js                # Queue operations & analytics logic
├── patient-app/              # Standalone Patient Web Portal
├── index.html                # Project Landing & Quick Portal Navigator
└── Dockerfile                # Containerization setup
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Java**: JDK 17 or higher
- **Node.js**: v18+ and npm
- **MongoDB**: Local MongoDB instance running on `localhost:27017` (or MongoDB Atlas URI)
- **Expo CLI**: `npm install -g expo-cli` (optional, can use `npx expo`)

---

### 2. Backend Setup (Spring Boot)

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Configure your environment variables or update `src/main/resources/application.properties`:
   ```properties
   server.port=8080
   spring.data.mongodb.uri=mongodb://localhost:27017/hospital_queue_db
   app.jwt.secret=your_super_secret_jwt_key_with_at_least_256_bits_here!
   ```
3. Build and run the server:
   ```bash
   mvn clean spring-boot:run
   ```
4. The backend will start on `http://localhost:8080`.

---

### 3. Web Admin & Patient Web Portals

1. Run a local web server (e.g., using VS Code Live Server, Python HTTP server, or Node `http-server`):
   ```bash
   # From the root directory:
   npx serve .
   ```
2. Access the portals:
   - **Unified Portal Launcher**: `http://localhost:3000/index.html`
   - **Admin / Doctor Dashboard**: `http://localhost:3000/web-admin/`
   - **Patient Web View**: `http://localhost:3000/patient-app/`

---

### 4. Patient Mobile App (Expo / React Native)

1. Navigate to the mobile app directory:
   ```bash
   cd patient-app-mobile
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npx expo start
   ```
4. **Testing Options**:
   - Press **`a`** to launch on an Android Emulator or connected USB device.
   - Scan the QR code using the **Expo Go** app on your physical Android/iOS device.
   - For standalone APK builds: `eas build --platform android --profile preview`

---

## 🔔 Push Notification Architecture

- On device login, the patient app securely obtains an **Expo Push Token** via `expo-notifications`.
- The token is registered in the backend (`/api/auth/push-token`).
- When a doctor calls a token or delays occur, the backend dispatches a push notification via the Expo Push Gateway directly to the patient's device with sound and high-priority banner alerts.

---

## 🔒 Security & Best Practices

- **Zero-Crash Push Notification Isolation**: Wrapped in failsafe try-catch handlers ensuring offline or unpermitted devices never crash.
- **JWT Token Refresh & Storage**: Secure credential handling with `expo-secure-store` on mobile and `localStorage` on web.
- **CORS Protection**: Fine-grained CORS origin filters configured for production and local environments.

---

## 📄 License
This project is proprietary and intended for hospital deployment and institutional evaluation.