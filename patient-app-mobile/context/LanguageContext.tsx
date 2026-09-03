import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSecureItem, saveSecureItem } from '../utils/storage';
import { authFetch } from '../utils/api';

export type Language = 'en' | 'ta';

export const translations = {
  en: {
    // Navigation
    home: 'Home',
    appointments: 'Appointments',
    liveQueue: 'Live Queue',
    profile: 'Profile',
    
    // Home Screen
    welcomeBack: 'Welcome back,',
    yourQueueToken: 'Your Queue Token',
    noActiveBooking: 'No active booking',
    currentlyServing: 'Currently Serving',
    peopleAhead: 'People Ahead',
    estWaitTime: 'Est. Wait Time',
    quickServices: 'Quick Services',
    bookAppointment: 'Book Appointment',
    liveQueueTracker: 'Live Queue Tracker',
    departments: 'Departments',
    myAppointments: 'My Appointments',
    allDoctors: 'All Doctors',
    medicalDepartments: 'Medical Departments',
    filterDoctorsSubtitle: 'Tap a department to filter doctors below',
    availableDoctors: 'Available Doctors',
    searchPlaceholder: 'Search by doctor or specialty...',
    activeAppointmentsCount: 'Active Appointments',
    viewAll: 'View All ➔',
    scheduled: 'Scheduled:',
    cancel: 'Cancel',
    room: 'Room',
    slots: 'slots',
    noSlots: 'No slots',
    
    // Live Queue Tab
    realTimeQueueTracker: 'Live Queue Tracker',
    activeTokenHeader: 'Your Active Token',
    queueState: 'Queue State',
    waitingQueue: 'Waiting Queue',
    estimatedWait: 'Est. Wait',
    patientsAhead: 'Patients Ahead',
    status: 'Status',
    
    // Appointments Tab
    myAppointmentsTitle: 'My Appointments',
    noAppointments: 'No appointments found',
    bookYourFirst: 'Book your first appointment with our specialist doctors',
    bookNow: 'Book Now',
    reschedule: 'Reschedule',
    rateConsultation: 'Rate Consultation',
    rateYourDoctor: 'Rate Your Doctor',
    commentsLabel: 'Comments & Review (Optional)',
    feedbackPlaceholder: 'Share details of your consultation experience...',
    submitRating: 'Submit Rating',
    
    // Profile Tab
    myProfile: 'My Profile',
    registeredHospital: 'Registered Hospital',
    accountRole: 'Account Role',
    patientRole: 'Patient',
    notificationLanguage: 'App & Notification Language (மொழி)',
    changePassword: 'Change Password',
    signOut: 'Sign Out',
    currentPassword: 'Current Password',
    newPassword: 'New Password (min 6 chars)',
    confirmNewPassword: 'Confirm New Password',
    updatePassword: 'Update Password',
    
    // Alerts & Notifications Screen
    notificationsTitle: 'Notifications',
    recentAlerts: 'Recent alerts',
    markAllRead: 'Mark all read',
    noNotificationsTitle: 'No new notifications',
    noNotificationsSub: 'You are all caught up!',
    back: 'Back',
    langUpdated: 'Language Updated',
    langUpdatedMsg: 'App & Notification language set to English.',
    cancelConfirmTitle: 'Cancel Appointment',
    cancelConfirmMsg: 'Are you sure you want to cancel this appointment?',
  },
  ta: {
    // Navigation
    home: 'முகப்பு',
    appointments: 'சந்திப்புகள்',
    liveQueue: 'நேரலை வரிசை',
    profile: 'சுயவிவரம்',
    
    // Home Screen
    welcomeBack: 'வணக்கம்,',
    yourQueueToken: 'உங்கள் டோக்கன் எண்',
    noActiveBooking: 'முன்பதிவு எதுவும் இல்லை',
    currentlyServing: 'தற்போது நடப்பது',
    peopleAhead: 'முன்னால் உள்ளவர்கள்',
    estWaitTime: 'காத்திருப்பு நேரம்',
    quickServices: 'முக்கிய சேவைகள்',
    bookAppointment: 'சந்திப்பு பதிவு',
    liveQueueTracker: 'நேரலை வரிசை',
    departments: 'மருத்துவத் துறைகள்',
    myAppointments: 'என் சந்திப்புகள்',
    allDoctors: 'அனைத்து மருத்துவர்கள்',
    medicalDepartments: 'மருத்துவத் துறைகள்',
    filterDoctorsSubtitle: 'மருத்துவர்களை வடிகட்ட துறையைத் தேர்ந்தெடுக்கவும்',
    availableDoctors: 'மருத்துவர்கள் பட்டியல்',
    searchPlaceholder: 'மருத்துவர் அல்லது துறை வாரியாக தேடவும்...',
    activeAppointmentsCount: 'செயலில் உள்ள டோக்கன்கள்',
    viewAll: 'அனைத்தையும் பார் ➔',
    scheduled: 'திட்டமிடப்பட்ட நேரம்:',
    cancel: 'ரத்து செய்',
    room: 'அறை',
    slots: 'நேரங்கள்',
    noSlots: 'நேரம் இல்லை',
    
    // Live Queue Tab
    realTimeQueueTracker: 'நேரலை வரிசை கண்காணிப்பு',
    activeTokenHeader: 'உங்கள் டோக்கன் விவரம்',
    queueState: 'வரிசை நிலை',
    waitingQueue: 'காத்திருக்கும் வரிசை',
    estimatedWait: 'சுமார் காத்திருப்பு',
    patientsAhead: 'முன்னுள்ள நோயாளிகள்',
    status: 'நிலை',
    
    // Appointments Tab
    myAppointmentsTitle: 'என் சந்திப்புகள்',
    noAppointments: 'சந்திப்புகள் எதுவும் இல்லை',
    bookYourFirst: 'சிறப்பு மருத்துவர்களுடன் முதல் சந்திப்பை பதிவு செய்யுங்கள்',
    bookNow: 'இப்போதே பதிவு செய்',
    reschedule: 'நேரம் மாற்று',
    rateConsultation: 'மதிப்பீடு செய்',
    rateYourDoctor: 'மருத்துவருக்கு மதிப்பீடு',
    commentsLabel: 'கருத்துகள் & விமர்சனம் (விருப்பப்பட்டால்)',
    feedbackPlaceholder: 'சந்திப்பு பற்றிய கூடுதல் கருத்துக்களை பகிரவும்...',
    submitRating: 'மதிப்பீட்டை அனுப்பு',
    
    // Profile Tab
    myProfile: 'என் சுயவிவரம்',
    registeredHospital: 'பதிவு செய்யப்பட்ட மருத்துவமனை',
    accountRole: 'பயனர் வகை',
    patientRole: 'நோயாளி (Patient)',
    notificationLanguage: 'ஆப் & அறிவிப்பு மொழி (Language)',
    changePassword: 'கடவுச்சொல் மாற்று (Change Password)',
    signOut: 'வெளியேறு (Sign Out)',
    currentPassword: 'தற்போதைய கடவுச்சொல்',
    newPassword: 'புதிய கடவுச்சொல் (குறைந்தது 6 எழுத்துக்கள்)',
    confirmNewPassword: 'புதிய கடவுச்சொல்லை உறுதிசெய்',
    updatePassword: 'கடவுச்சொல்லை மாற்று',
    
    // Alerts & Notifications Screen
    notificationsTitle: 'அறிவிப்புகள்',
    recentAlerts: 'சமீபத்திய அறிவிப்புகள்',
    markAllRead: 'அனைத்தையும் படித்ததாகக் குறி',
    noNotificationsTitle: 'புதிய அறிவிப்புகள் எதுவும் இல்லை',
    noNotificationsSub: 'அனைத்து அறிவிப்புகளும் புதுப்பிக்கப்பட்டுள்ளன!',
    back: 'பின்னே',
    langUpdated: 'மொழி மாற்றப்பட்டது',
    langUpdatedMsg: 'ஆப் மற்றும் அறிவிப்புகள் இனி தமிழில் வரும்.',
    cancelConfirmTitle: 'சந்திப்பை ரத்து செய்',
    cancelConfirmMsg: 'இந்த சந்திப்பை நிச்சயமாக ரத்து செய்ய விரும்புகிறீர்களா?',
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: typeof translations.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ta');

  useEffect(() => {
    async function loadLang() {
      const saved = await getSecureItem('app_language');
      if (saved === 'en' || saved === 'ta') {
        setLanguageState(saved);
      }
    }
    loadLang();
  }, []);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await saveSecureItem('app_language', lang);
    try {
      await authFetch('/auth/profile/language', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
    } catch (e) {
      console.log('Error syncing language with backend:', e);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: translations[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
