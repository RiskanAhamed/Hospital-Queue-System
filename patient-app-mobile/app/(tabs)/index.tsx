import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authFetch, API_BASE, getErrorMessage } from '../../utils/api';
import {
  connectWebSocket,
  subscribeToQueue,
  subscribeToNotifications,
  subscribeToDoctors,
  disconnectWebSocket,
  unsubscribeFromQueue,
} from '../../utils/websocket';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { showLocalNotification } from '../../utils/pushNotifications';
import { useLanguage } from '../../context/LanguageContext';

interface Doctor {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  roomNumber: string;
  status: string;
  availableSlots?: string[];
  averageRating?: number;
  totalRatings?: number;
  availableSlotsCount?: number;
}

interface Department {
  id: string;
  name: string;
  code?: string;
  description?: string;
}

interface Appointment {
  id: string;
  patientId?: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  appointmentDate: string;
  timeSlot: string;
  queueNumber: string;
  status: string;
}

export default function HomeScreen() {
  const { user, hospitalId, hospitalName, updateHospitalName, token } = useAuth();
  const { t, language } = useLanguage();
  const router = useRouter();
  const isFocused = useIsFocused();

  const [refreshing, setRefreshing] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [allActiveAppointments, setAllActiveAppointments] = useState<Appointment[]>([]);
  
  // Real-time Queue details
  const [currentlyServing, setCurrentlyServing] = useState('--');
  const [peopleAhead, setPeopleAhead] = useState<number | string>('--');
  const [estWaitTime, setEstWaitTime] = useState('--');
  const [queueBannerText, setQueueBannerText] = useState('Select a doctor below to book an appointment');
  const [queueBannerStyle, setQueueBannerStyle] = useState('info'); // info, waiting, called, completed

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load all initial details
  const loadData = useCallback(async () => {
    if (!hospitalId || !user?.userId) return;

    try {
      // 1. Fetch Hospital Info
      const hospRes = await authFetch(`/hospitals/${hospitalId}`);
      if (hospRes.ok) {
        const hosp = await hospRes.json();
        if (hosp && hosp.name && hosp.name !== hospitalName) {
          await updateHospitalName(hosp.name);
        }
      }

      // 2. Fetch Departments
      const deptRes = await authFetch(`/hospitals/${hospitalId}/departments`);
      if (deptRes.ok) {
        const depts = await deptRes.json();
        setDepartments(depts || []);
      }

      // 3. Fetch Doctors
      const docRes = await authFetch(`/hospitals/${hospitalId}/doctors`);
      if (docRes.ok) {
        const docs = await docRes.json();
        setDoctors(docs || []);
      }

      // 4. Fetch Active Appointments
      const apptRes = await authFetch(`/hospitals/${hospitalId}/appointments?patientId=${user.userId}`);
      if (apptRes.ok) {
        const appts: Appointment[] = await apptRes.json();
        const todayStr = new Date().toISOString().split('T')[0];
        const activeList = (appts || [])
          .filter(
            (a) =>
              (a.status === 'BOOKED' ||
                a.status === 'CHECKED_IN' ||
                a.status === 'WAITING' ||
                a.status === 'CALLED' ||
                a.status === 'IN_CONSULTATION') &&
              a.appointmentDate >= todayStr
          )
          .sort((a, b) => {
            if (a.appointmentDate === todayStr && b.appointmentDate !== todayStr) return -1;
            if (b.appointmentDate === todayStr && a.appointmentDate !== todayStr) return 1;
            return (
              a.appointmentDate.localeCompare(b.appointmentDate) ||
              (a.timeSlot || '').localeCompare(b.timeSlot || '')
            );
          });
        setAllActiveAppointments(activeList);

        // Keep current selected if still active, otherwise pick first
        setActiveAppointment((prev) => {
          if (prev && activeList.some((a) => a.id === prev.id)) {
            const updated = activeList.find((a) => a.id === prev.id)!;
            fetchStaticQueueSummary(updated.doctorId);
            return updated;
          }
          const nextActive = activeList[0] || null;
          if (nextActive) {
            fetchStaticQueueSummary(nextActive.doctorId);
          } else {
            // Reset real-time fields
            setCurrentlyServing('--');
            setPeopleAhead('--');
            setEstWaitTime('--');
            setQueueBannerText('Select a doctor below to book an appointment');
            setQueueBannerStyle('info');
            unsubscribeFromQueue();
          }
          return nextActive;
        });
      }

      // 5. Fetch Notification Unread Count
      const notifUrl = user?.userId 
        ? `/hospitals/${hospitalId}/notifications/unread-count?userId=${encodeURIComponent(user.userId)}`
        : `/hospitals/${hospitalId}/notifications/unread-count`;
      const notifRes = await authFetch(notifUrl);
      if (notifRes.ok) {
        const countData = await notifRes.json();
        const unread = typeof countData === 'number' ? countData : (countData?.unreadCount ?? 0);
        setUnreadNotifications(unread);
      }
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hospitalId, user?.userId, hospitalName]);

  const fetchStaticQueueSummary = async (doctorId: string) => {
    try {
      const res = await authFetch(`/hospitals/${hospitalId}/queues/doctor/${doctorId}`);
      if (res.ok) {
        const summary = await res.json();
        if (summary) updateQueueDetails(summary);
      }
    } catch (e) {
      console.error('Error fetching static queue summary:', e);
    }
  };

  const updateQueueDetails = useCallback((summary: any) => {
    if (!summary) return;
    const serving = summary.currentlyServingToken || '--';
    setCurrentlyServing(serving);

    if (!activeAppointment) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = activeAppointment.appointmentDate === todayStr;

    const doc = doctors.find((d) => d.id === (summary.doctorId || activeAppointment.doctorId));
    const roomName = doc?.roomNumber ? `Room ${doc.roomNumber}` : 'Doctor Room';

    if (!isToday) {
      setPeopleAhead('--');
      setEstWaitTime('--');
      setQueueBannerStyle('info');
      setQueueBannerText(`📅 Scheduled for ${activeAppointment.appointmentDate} at ${activeAppointment.timeSlot || ''}`);
      return;
    }

    const myToken = activeAppointment.queueNumber;
    const entries = summary.entries || [];
    const myEntry = entries.find((e: any) => (myToken && e.queueNumber === myToken) || e.appointmentId === activeAppointment.id || e.id === activeAppointment.id);

    if (serving === myToken || (myEntry && (myEntry.status === 'CALLED' || myEntry.status === 'IN_CONSULTATION'))) {
      setPeopleAhead(0);
      setEstWaitTime('Now!');
      setQueueBannerStyle('called');
      setQueueBannerText(`Your turn! Please enter ${roomName}`);
    } else if (myEntry && myEntry.status === 'COMPLETED') {
      setPeopleAhead(0);
      setEstWaitTime('Done');
      setQueueBannerStyle('completed');
      setQueueBannerText('Consultation Completed. Thank you!');
    } else if (myEntry && myEntry.status === 'WAITING') {
      const waitingEntries = entries.filter((e: any) => e.status === 'WAITING');
      const myIndex = waitingEntries.findIndex((e: any) => (myToken && e.queueNumber === myToken) || e.appointmentId === activeAppointment.id || e.id === activeAppointment.id);
      const aheadCount = myIndex >= 0 ? myIndex : 0;
      const waitStr = aheadCount === 0 ? 'Next up!' : `${aheadCount * 10} mins`;

      let bannerMsg = `Waiting in queue (${aheadCount} patient${aheadCount !== 1 ? 's' : ''} ahead)`;
      if (aheadCount === 0) {
        bannerMsg = `🔔 You're next in line! Please wait outside ${roomName}`;
      } else if (aheadCount === 1) {
        bannerMsg = `🔔 Almost your turn (1 ahead)! Proceed towards ${roomName}`;
      } else if (aheadCount === 2) {
        bannerMsg = `🔔 2 tokens away! Please head towards ${roomName}`;
      }

      setPeopleAhead(aheadCount);
      setEstWaitTime(waitStr);
      setQueueBannerStyle('waiting');
      setQueueBannerText(bannerMsg);
    } else {
      setPeopleAhead(summary.waitingCount ?? '--');
      setEstWaitTime(summary.waitingCount ? `${summary.waitingCount * 10} mins` : '--');
      setQueueBannerStyle('info');
      setQueueBannerText(`📅 Today at ${activeAppointment.timeSlot || ''} (Token ${activeAppointment.queueNumber || '--'})`);
    }
  }, [activeAppointment, doctors]);

  // Hook up WebSockets
  useEffect(() => {
    if (!token || !hospitalId || !isFocused) return;

    const stompClient = connectWebSocket(token, () => {
      // Subscribe to unread notifications
      if (user?.userId) {
        subscribeToNotifications(hospitalId, user.userId, (notif) => {
          loadData();
          if (notif && (notif.title || notif.message)) {
            showLocalNotification(
              notif.title || 'MediFlow Queue Alert',
              notif.message || 'You have a new update.',
              notif
            );
          }
        });
      }

      // Subscribe to real-time doctor list updates
      subscribeToDoctors(hospitalId, (updatedDoctor) => {
        if (!updatedDoctor || !updatedDoctor.id) return;
        setDoctors((prev) => {
          const idx = prev.findIndex((d) => d.id === updatedDoctor.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...updatedDoctor };
            return next;
          }
          return [...prev, updatedDoctor];
        });
      });

      // Subscribe to queue topic if active ticket exists
      if (activeAppointment) {
        subscribeToQueue(hospitalId, activeAppointment.doctorId, (summary) => {
          updateQueueDetails(summary);
        });
      } else {
        unsubscribeFromQueue();
      }
    });

    return () => {
      if (!isFocused) {
        // Disconnect websocket when tab is completely blurred (reduces server load)
        disconnectWebSocket();
      }
    };
  }, [token, hospitalId, activeAppointment, user?.userId, isFocused, updateQueueDetails]);

  // Initial and refocus load
  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCancelAppointment = () => {
    if (!activeAppointment) return;
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this appointment?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await authFetch(
                `/hospitals/${hospitalId}/appointments/${activeAppointment.id}/cancel`,
                { method: 'POST' }
              );
              if (res.ok) {
                Alert.alert('Cancelled', 'Your appointment has been cancelled successfully.');
                loadData();
              } else {
                const errorMsg = await getErrorMessage(res, 'Could not cancel appointment.');
                Alert.alert('Error', errorMsg);
              }
            } catch (e) {
              Alert.alert('Error', 'Connection error.');
            }
          },
        },
      ]
    );
  };

  // Filtered doctors with null safety and specialization support
  const filteredDoctors = doctors.filter((doc) => {
    const q = (searchQuery || '').trim().toLowerCase();
    const docName = (doc.name || '').toLowerCase();
    const deptName = (doc.departmentName || '').toLowerCase();
    const matchesSearch = !q || docName.includes(q) || deptName.includes(q);
    const matchesDept = selectedDeptId ? doc.departmentId === selectedDeptId : true;
    return matchesSearch && matchesDept;
  });

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.userSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
          </View>
          <View>
            <Text style={styles.greetingSub}>{t.welcomeBack}</Text>
            <Text style={styles.userName}>{user?.name || 'Patient'}</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <View style={styles.hospitalPill}>
            <Ionicons name="business" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
            <Text style={styles.hospitalText} numberOfLines={1}>
              {hospitalName || 'My Hospital'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications" size={20} color="#94A3B8" />
            {unreadNotifications > 0 && (
              <View style={styles.bellDot} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Multi-Active Appointments Switcher (when patient has booked 2+ doctors) */}
        {allActiveAppointments.length > 1 && (
          <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#38BDF8' }}>
                {t.activeAppointmentsCount} ({allActiveAppointments.length})
              </Text>
              <TouchableOpacity onPress={() => router.navigate('/(tabs)/appointments')}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8' }}>{t.viewAll}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {allActiveAppointments.map((appt) => {
                const isSelected = activeAppointment?.id === appt.id;
                return (
                  <TouchableOpacity
                    key={appt.id}
                    onPress={() => {
                      setActiveAppointment(appt);
                      fetchStaticQueueSummary(appt.doctorId);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isSelected ? '#38BDF8' : 'rgba(255,255,255,0.06)',
                      borderColor: isSelected ? '#38BDF8' : 'rgba(255,255,255,0.12)',
                      borderWidth: 1,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      borderRadius: 20,
                    }}
                  >
                    <Ionicons
                      name="medkit"
                      size={14}
                      color={isSelected ? '#090D16' : '#38BDF8'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: isSelected ? '#090D16' : '#F8FAFC',
                      }}
                    >
                      {appt.doctorName} ({appt.queueNumber || appt.timeSlot})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Ticket card section */}
        <View style={styles.ticketSection}>
          <View style={styles.ticketCard}>
            <View style={styles.ticketHeader}>
              <View style={styles.hospitalTag}>
                <View style={styles.liveIndicator} />
                <Text style={styles.hospitalTagText} numberOfLines={1}>
                  {hospitalName || 'City Care General'}
                </Text>
              </View>
              <Text style={styles.roomTag}>
                {activeAppointment ? `${t.room} ${doctors.find(d => d.id === activeAppointment.doctorId)?.roomNumber || '302'}` : `${t.room} --`}
              </Text>
            </View>

            <View style={styles.ticketBody}>
              <Text style={styles.tokenLabel}>{t.yourQueueToken}</Text>
              <Text style={styles.tokenNumber}>
                {activeAppointment ? activeAppointment.queueNumber : '--'}
              </Text>
              <Text style={styles.doctorName}>
                {activeAppointment
                  ? `${activeAppointment.doctorName} (${activeAppointment.departmentName})`
                  : t.noActiveBooking}
              </Text>

              {/* Counters row */}
              <View style={styles.countersRow}>
                <View style={styles.counterBox}>
                  <Text style={styles.counterLabel}>{t.currentlyServing}</Text>
                  <Text style={styles.counterValue}>{currentlyServing}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.counterBox}>
                  <Text style={styles.counterLabel}>{t.peopleAhead}</Text>
                  <Text style={styles.counterValue}>{peopleAhead}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.counterBox}>
                  <Text style={styles.counterLabel}>{t.estWaitTime}</Text>
                  <Text style={styles.counterValue}>{estWaitTime}</Text>
                </View>
              </View>

              {/* Banner */}
              <View
                style={[
                  styles.banner,
                  queueBannerStyle === 'called' && styles.bannerCalled,
                  queueBannerStyle === 'completed' && styles.bannerCompleted,
                  queueBannerStyle === 'waiting' && styles.bannerWaiting,
                ]}
              >
                <Ionicons
                  name={
                    queueBannerStyle === 'called'
                      ? 'megaphone'
                      : queueBannerStyle === 'completed'
                      ? 'checkmark-circle'
                      : 'pulse'
                  }
                  size={16}
                  color={
                    queueBannerStyle === 'called'
                      ? '#C084FC'
                      : queueBannerStyle === 'completed'
                      ? '#34D399'
                      : queueBannerStyle === 'waiting'
                      ? '#FBBF24'
                      : '#94A3B8'
                  }
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.bannerText,
                    queueBannerStyle === 'called' && styles.bannerTextCalled,
                    queueBannerStyle === 'completed' && styles.bannerTextCompleted,
                    queueBannerStyle === 'waiting' && styles.bannerTextWaiting,
                  ]}
                  numberOfLines={2}
                >
                  {queueBannerText}
                </Text>
              </View>
            </View>

            <View style={styles.ticketFooter}>
              <View style={styles.scheduleInfo}>
                <Ionicons name="time-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                <Text style={styles.scheduleText} numberOfLines={1}>
                  {t.scheduled}{' '}
                  {activeAppointment
                    ? `${activeAppointment.appointmentDate} ${activeAppointment.timeSlot}`
                    : 'None'}
                </Text>
              </View>

              {activeAppointment && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelAppointment}
                >
                  <Ionicons name="close-circle-outline" size={14} color="#F87171" style={{ marginRight: 4 }} />
                  <Text style={styles.cancelBtnText}>{t.cancel}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Quick action grid */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{t.quickServices}</Text>
          <View style={styles.quickGrid}>
            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => setSelectedDeptId(null)} // resets filters
            >
              <View style={[styles.iconCircle, styles.circleBlue]}>
                <Ionicons name="calendar-outline" size={20} color="#38BDF8" />
              </View>
              <Text style={styles.quickCardText}>{t.bookAppointment}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => router.navigate('/(tabs)/queue')}
            >
              <View style={[styles.iconCircle, styles.circleGreen]}>
                <Ionicons name="people-outline" size={20} color="#34D399" />
              </View>
              <Text style={styles.quickCardText}>{t.liveQueueTracker}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => {
                // Focus / filter departments
                setSelectedDeptId(null);
              }}
            >
              <View style={[styles.iconCircle, styles.circlePurple]}>
                <Ionicons name="grid-outline" size={20} color="#A855F7" />
              </View>
              <Text style={styles.quickCardText}>{t.departments}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickCard}
              onPress={() => router.navigate('/(tabs)/appointments')}
            >
              <View style={[styles.iconCircle, styles.circleOrange]}>
                <Ionicons name="calendar" size={20} color="#FB923C" />
              </View>
              <Text style={styles.quickCardText}>{t.myAppointments}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Departments Filter Block */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>{t.medicalDepartments}</Text>
          <Text style={styles.sectionSubtitle}>{t.filterDoctorsSubtitle}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsContainer}
          >
            <TouchableOpacity
              style={[styles.pill, selectedDeptId === null && styles.pillActive]}
              onPress={() => setSelectedDeptId(null)}
            >
              <Text style={[styles.pillText, selectedDeptId === null && styles.pillTextActive]}>
                {t.allDoctors}
              </Text>
            </TouchableOpacity>
            {departments.map((dept) => (
              <TouchableOpacity
                key={dept.id}
                style={[styles.pill, selectedDeptId === dept.id && styles.pillActive]}
                onPress={() => setSelectedDeptId(dept.id)}
              >
                <Text style={[styles.pillText, selectedDeptId === dept.id && styles.pillTextActive]}>
                  {dept.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Doctors block */}
        <View style={[styles.sectionBlock, { marginBottom: 30 }]}>
          <View style={styles.doctorsHeader}>
            <Text style={styles.sectionTitle}>{t.availableDoctors}</Text>
          </View>

          {/* Search bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder={t.searchPlaceholder}
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {filteredDoctors.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color="#64748B" />
              <Text style={styles.emptyText}>No available doctors match your criteria.</Text>
            </View>
          ) : (
            filteredDoctors.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.doctorCard}
                onPress={() => router.push({
                  pathname: '/booking',
                  params: { doctorId: doc.id, doctorName: doc.name, specialty: doc.departmentName, roomNumber: doc.roomNumber }
                })}
              >
                <View style={styles.docHeader}>
                  <View style={styles.docInfo}>
                    <Text style={styles.docName}>{doc.name}</Text>
                    <Text style={styles.docSpecialty}>{doc.departmentName}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusIndicator,
                      doc.status === 'AVAILABLE' && styles.statusAvailable,
                      doc.status === 'BUSY' && styles.statusBusy,
                      doc.status === 'AWAY' && styles.statusAway,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        doc.status === 'AVAILABLE' && styles.statusTextAvailable,
                        doc.status === 'BUSY' && styles.statusTextBusy,
                        doc.status === 'AWAY' && styles.statusTextAway,
                      ]}
                    >
                      {doc.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.docDetailsRow}>
                  <View style={styles.docDetailCell}>
                    <Ionicons name="business-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.docDetailText}>Room {doc.roomNumber}</Text>
                  </View>
                  <View style={styles.docDetailCell}>
                    <Ionicons name="star" size={13} color="#FBBF24" style={{ marginRight: 3 }} />
                    <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '700' }}>
                      {doc.totalRatings && doc.totalRatings > 0
                        ? `${(doc.averageRating || 5.0).toFixed(1)} (${doc.totalRatings})`
                        : '★ New'}
                    </Text>
                  </View>
                  <View style={styles.docDetailCell}>
                    <Ionicons name="calendar-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.docDetailText}>
                      {doc.availableSlots ? `${doc.availableSlots.length} slots` : 'No slots'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.btnBook}
                  onPress={() => router.push({
                    pathname: '/booking',
                    params: { doctorId: doc.id, doctorName: doc.name, specialty: doc.departmentName, roomNumber: doc.roomNumber }
                  })}
                >
                  <Text style={styles.btnBookText}>Book Appointment</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#38BDF8',
    fontWeight: '700',
    fontSize: 14,
  },
  greetingSub: {
    fontSize: 11,
    color: '#94A3B8',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hospitalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    maxWidth: 120,
  },
  hospitalText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  bellButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 6,
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  scrollContent: {
    padding: 16,
  },
  ticketSection: {
    marginBottom: 20,
  },
  ticketCard: {
    width: '100%',
    backgroundColor: 'rgba(26, 36, 56, 0.75)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  hospitalTag: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '65%',
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginRight: 6,
  },
  hospitalTagText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  roomTag: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ticketBody: {
    padding: 16,
    alignItems: 'center',
  },
  tokenLabel: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tokenNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F8FAFC',
    marginVertical: 4,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 16,
  },
  countersRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 12,
    marginBottom: 12,
  },
  counterBox: {
    alignItems: 'center',
    flex: 1,
  },
  counterLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignSelf: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: '100%',
  },
  bannerWaiting: {
    backgroundColor: 'rgba(251, 191, 36, 0.06)',
    borderColor: 'rgba(251, 191, 36, 0.15)',
  },
  bannerCalled: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    borderColor: 'rgba(168, 85, 247, 0.2)',
  },
  bannerCompleted: {
    backgroundColor: 'rgba(52, 211, 153, 0.08)',
    borderColor: 'rgba(52, 211, 153, 0.15)',
  },
  bannerText: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
  },
  bannerTextWaiting: {
    color: '#FBBF24',
  },
  bannerTextCalled: {
    color: '#C084FC',
    fontWeight: '600',
  },
  bannerTextCompleted: {
    color: '#34D399',
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scheduleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '75%',
  },
  scheduleText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    borderColor: 'rgba(248, 113, 113, 0.25)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cancelBtnText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionBlock: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 10,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  quickCard: {
    width: '48%',
    backgroundColor: 'rgba(26, 36, 56, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  circleBlue: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  circleGreen: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
  },
  circlePurple: {
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
  },
  circleOrange: {
    backgroundColor: 'rgba(251, 146, 60, 0.1)',
  },
  quickCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F8FAFC',
    flex: 1,
  },
  pillsContainer: {
    paddingVertical: 4,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pillActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  pillTextActive: {
    color: '#090D16',
  },
  doctorsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },
  doctorCard: {
    backgroundColor: 'rgba(26, 36, 56, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  docSpecialty: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusAvailable: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
  },
  statusBusy: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },
  statusAway: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextAvailable: {
    color: '#34D399',
  },
  statusTextBusy: {
    color: '#F87171',
  },
  statusTextAway: {
    color: '#FBBF24',
  },
  docDetailsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  docDetailCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docDetailText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  btnBook: {
    width: '100%',
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnBookText: {
    color: '#38BDF8',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
});
