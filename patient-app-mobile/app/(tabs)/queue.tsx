import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authFetch } from '../../utils/api';
import {
  connectWebSocket,
  subscribeToQueue,
  disconnectWebSocket,
  unsubscribeFromQueue,
} from '../../utils/websocket';
import { useIsFocused } from '@react-navigation/native';
import { useLanguage } from '../../context/LanguageContext';

interface Appointment {
  id: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  appointmentDate: string;
  timeSlot: string;
  queueNumber: string;
  status: string;
}

export default function QueueScreen() {
  const { token, hospitalId, user } = useAuth();
  const { t } = useLanguage();
  const isFocused = useIsFocused();

  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Real-time states
  const [currentlyServing, setCurrentlyServing] = useState('--');
  const [peopleAhead, setPeopleAhead] = useState<number | string>('--');
  const [estWaitTime, setEstWaitTime] = useState('--');
  const [bannerText, setBannerText] = useState('Book an appointment to track live status');
  const [bannerStyle, setBannerStyle] = useState('info'); // info, waiting, called, completed

  const fetchActiveAppointmentAndQueue = useCallback(async () => {
    if (!hospitalId || !user?.userId) return;

    try {
      const res = await authFetch(`/hospitals/${hospitalId}/appointments?patientId=${user.userId}`);
      if (res.ok) {
        const appts: Appointment[] = await res.json();
        const active = appts.find(
          (a) =>
            a.status === 'BOOKED' ||
            a.status === 'CHECKED_IN' ||
            a.status === 'WAITING' ||
            a.status === 'CALLED' ||
            a.status === 'IN_CONSULTATION'
        );
        setActiveAppointment(active || null);

        if (!active) {
          setCurrentlyServing('--');
          setPeopleAhead('--');
          setEstWaitTime('--');
          setBannerText('Book an appointment to track live status');
          setBannerStyle('info');
          unsubscribeFromQueue();
        } else {
          // Fetch queue summary immediately
          const summaryRes = await authFetch(`/hospitals/${hospitalId}/queues/doctor/${active.doctorId}`);
          if (summaryRes.ok) {
            const summary = await summaryRes.json();
            updateQueue(summary, active);
          }
        }
      }
    } catch (e) {
      console.error('Error fetching queue status:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hospitalId, user?.userId]);

  const updateQueue = useCallback((summary: any, active: Appointment | null) => {
    if (!summary) return;
    const serving = summary.currentlyServingToken || '--';
    setCurrentlyServing(serving);

    const activeAppt = active || activeAppointment;
    if (!activeAppt) return;
    const myToken = activeAppt.queueNumber;
    const entries = summary.entries || [];
    const myEntry = entries.find((e: any) => e.queueNumber === myToken || e.id === activeAppt.id);

    const roomName = `Room 302`; // Default or resolved from details

    if (serving === myToken || (myEntry && (myEntry.status === 'CALLED' || myEntry.status === 'IN_CONSULTATION'))) {
      setPeopleAhead(0);
      setEstWaitTime('Now!');
      setBannerStyle('called');
      setBannerText(`Your turn! Please enter ${roomName}`);
    } else if (myEntry && myEntry.status === 'COMPLETED') {
      setPeopleAhead(0);
      setEstWaitTime('Done');
      setBannerStyle('completed');
      setBannerText('Consultation Completed. Thank you!');
    } else {
      const waitingEntries = entries.filter((e: any) => e.status === 'WAITING');
      const myIndex = waitingEntries.findIndex((e: any) => e.queueNumber === myToken);
      const aheadCount = myIndex >= 0 ? myIndex : waitingEntries.length;
      const waitStr = aheadCount === 0 ? 'Next up!' : `${aheadCount * 10} mins`;

      let statusMsg = `Waiting in queue (${aheadCount} patient${aheadCount !== 1 ? 's' : ''} ahead)`;
      if (aheadCount === 0) {
        statusMsg = `🔔 You're next in line! Please wait outside consultation room`;
      } else if (aheadCount === 1) {
        statusMsg = `🔔 Almost your turn (1 ahead)! Proceed towards consultation room`;
      } else if (aheadCount === 2) {
        statusMsg = `🔔 2 tokens away! Please head towards the waiting area`;
      }

      setPeopleAhead(aheadCount);
      setEstWaitTime(waitStr);
      setBannerStyle('waiting');
      setBannerText(statusMsg);
    }
  }, [activeAppointment]);

  // Handle active WS subscription
  useEffect(() => {
    if (!token || !hospitalId || !isFocused) return;

    connectWebSocket(token, () => {
      if (activeAppointment) {
        subscribeToQueue(hospitalId, activeAppointment.doctorId, (summary) => {
          updateQueue(summary, activeAppointment);
        });
      } else {
        unsubscribeFromQueue();
      }
    });

    return () => {
      if (!isFocused) {
        disconnectWebSocket();
      }
    };
  }, [token, hospitalId, activeAppointment, isFocused, updateQueue]);

  useEffect(() => {
    if (isFocused) {
      fetchActiveAppointmentAndQueue();
    }
  }, [isFocused]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveAppointmentAndQueue();
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.realTimeQueueTracker}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.ticketCard}>
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketHeaderSub}>{t.activeTokenHeader}</Text>
            <View style={[styles.badge, activeAppointment ? styles.badgeActive : styles.badgeInactive]}>
              <Text style={[styles.badgeText, activeAppointment ? styles.badgeTextActive : styles.badgeTextInactive]}>
                {activeAppointment ? 'Active' : t.noActiveBooking}
              </Text>
            </View>
          </View>

          <View style={styles.ticketBody}>
            <Text style={styles.label}>{t.yourQueueToken}</Text>
            <Text style={styles.tokenNumber}>
              {activeAppointment ? activeAppointment.queueNumber : '--'}
            </Text>
            <Text style={styles.doctorName}>
              {activeAppointment
                ? `${activeAppointment.doctorName} (${activeAppointment.departmentName})`
                : t.noActiveBooking}
            </Text>

            {/* Live stats row */}
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

            {/* Banner status */}
            <View
              style={[
                styles.banner,
                bannerStyle === 'called' && styles.bannerCalled,
                bannerStyle === 'completed' && styles.bannerCompleted,
                bannerStyle === 'waiting' && styles.bannerWaiting,
              ]}
            >
              <Ionicons
                name={
                  bannerStyle === 'called'
                    ? 'megaphone'
                    : bannerStyle === 'completed'
                    ? 'checkmark-circle'
                    : 'pulse'
                }
                size={18}
                color={
                  bannerStyle === 'called'
                    ? '#C084FC'
                    : bannerStyle === 'completed'
                    ? '#34D399'
                    : bannerStyle === 'waiting'
                    ? '#FBBF24'
                    : '#94A3B8'
                }
                style={{ marginRight: 8 }}
              />
              <Text
                style={[
                  styles.bannerText,
                  bannerStyle === 'called' && styles.bannerTextCalled,
                  bannerStyle === 'completed' && styles.bannerTextCompleted,
                  bannerStyle === 'waiting' && styles.bannerTextWaiting,
                ]}
              >
                {bannerText}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.footerNote}>
          Updates in real-time via WebSocket STOMP interface
        </Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  ticketCard: {
    backgroundColor: 'rgba(26, 36, 56, 0.75)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    marginTop: 10,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  ticketHeaderSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#34D399',
  },
  badgeTextInactive: {
    color: '#94A3B8',
  },
  ticketBody: {
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tokenNumber: {
    fontSize: 54,
    fontWeight: '800',
    color: '#F8FAFC',
    marginVertical: 10,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 24,
  },
  countersRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 16,
    marginBottom: 20,
  },
  counterBox: {
    alignItems: 'center',
    flex: 1,
  },
  counterLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 6,
  },
  counterValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  divider: {
    width: 1,
    height: '70%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignSelf: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 12,
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
  footerNote: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 20,
  },
});
