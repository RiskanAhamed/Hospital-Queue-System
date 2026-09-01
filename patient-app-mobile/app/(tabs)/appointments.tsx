import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { authFetch } from '../../utils/api';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';

interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  departmentName: string;
  appointmentDate: string;
  timeSlot: string;
  queueNumber: string;
  status: 'BOOKED' | 'CHECKED_IN' | 'WAITING' | 'CALLED' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED';
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  BOOKED: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8' },
  CHECKED_IN: { bg: 'rgba(56,189,248,0.12)', color: '#38BDF8' },
  WAITING: { bg: 'rgba(251,191,36,0.12)', color: '#FBBF24' },
  CALLED: { bg: 'rgba(168,85,247,0.15)', color: '#C084FC' },
  IN_CONSULTATION: { bg: 'rgba(52,211,153,0.15)', color: '#34D399' },
  COMPLETED: { bg: 'rgba(52,211,153,0.12)', color: '#34D399' },
  CANCELLED: { bg: 'rgba(248,113,113,0.12)', color: '#F87171' },
};

export default function AppointmentsScreen() {
  const { hospitalId, user } = useAuth();
  const router = useRouter();
  const isFocused = useIsFocused();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAppointments = useCallback(async () => {
    if (!hospitalId || !user?.userId) return;

    try {
      const res = await authFetch(`/hospitals/${hospitalId}/appointments?patientId=${user.userId}`);
      if (res.ok) {
        const data: Appointment[] = await res.json();
        // Sort newest first
        const sorted = (data || []).sort((a, b) => {
          const da = a.appointmentDate || '';
          const db = b.appointmentDate || '';
          return db.localeCompare(da) || (b.timeSlot || '').localeCompare(a.timeSlot || '');
        });
        setAppointments(sorted);
      } else {
        console.error('Failed to fetch appointments, status:', res.status);
      }
    } catch (e) {
      console.error('Error fetching appointments:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hospitalId, user?.userId]);

  useEffect(() => {
    if (isFocused) {
      fetchAppointments();
    }
  }, [isFocused]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAppointments();
  };

  const formatSlotTime = (slot: string) => {
    try {
      const [hh, mm] = slot.split(':');
      const h = parseInt(hh, 10);
      const period = h < 12 ? 'AM' : 'PM';
      const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${String(dh).padStart(2, '0')}:${mm} ${period}`;
    } catch (e) {
      return slot;
    }
  };

  const handleCancelAppointment = (id: string) => {
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
              const res = await authFetch(`/hospitals/${hospitalId}/appointments/${id}/cancel`, {
                method: 'POST',
              });
              if (res.ok) {
                Alert.alert('Success', 'Appointment cancelled.');
                fetchAppointments();
              } else {
                const text = await res.text();
                Alert.alert('Failed', text || 'Could not cancel.');
              }
            } catch (e) {
              Alert.alert('Error', 'Connection error.');
            }
          },
        },
      ]
    );
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
        <Text style={styles.headerTitle}>My Appointments</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color="#38BDF8" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {appointments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={60} color="#64748B" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No appointments yet</Text>
            <Text style={styles.emptySubtitle}>
              Book your first appointment from the Home tab.
            </Text>
          </View>
        ) : (
          appointments.map((item) => {
            const sc = STATUS_COLORS[item.status] || { bg: 'rgba(255,255,255,0.06)', color: '#94A3B8' };
            const canAction = item.status !== 'CANCELLED' && item.status !== 'COMPLETED';

            return (
              <View key={item.id} style={styles.apptCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.doctorName}>{item.doctorName}</Text>
                    <Text style={styles.departmentName}>{item.departmentName}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: sc.color }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>

                {/* Details line */}
                <View style={styles.detailsRow}>
                  <View style={styles.detailItem}>
                    <Ionicons name="calendar-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.detailText}>{item.appointmentDate}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="time-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.detailText}>{formatSlotTime(item.timeSlot)}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Ionicons name="bookmark-outline" size={14} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text style={styles.detailText}>Token {item.queueNumber || '--'}</Text>
                  </View>
                </View>

                {/* Actions row */}
                {canAction && (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.btnReschedule}
                      onPress={() =>
                        router.push({
                          pathname: '/reschedule',
                          params: {
                            apptId: item.id,
                            doctorId: item.doctorId,
                            doctorName: item.doctorName,
                            specialty: item.departmentName,
                          },
                        })
                      }
                    >
                      <Ionicons name="create-outline" size={14} color="#38BDF8" style={{ marginRight: 4 }} />
                      <Text style={styles.btnRescheduleText}>Reschedule</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnCancel}
                      onPress={() => handleCancelAppointment(item.id)}
                    >
                      <Ionicons name="close-circle-outline" size={14} color="#F87171" style={{ marginRight: 4 }} />
                      <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
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
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  refreshBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    paddingVertical: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  apptCard: {
    backgroundColor: 'rgba(26, 36, 56, 0.75)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  departmentName: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 12,
  },
  btnReschedule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnRescheduleText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderColor: 'rgba(248, 113, 113, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnCancelText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
});
