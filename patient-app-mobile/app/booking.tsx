import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../utils/api';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface SlotResponse {
  timeSlot: string;
  appointmentDate: string;
  status: string;
}

export default function BookingScreen() {
  const { hospitalId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { doctorId, doctorName, specialty, roomNumber } = params;

  // Next 10 days generator for horizontal calendar strip
  const [dates, setDates] = useState<{ dayName: string; dayNum: string; isoString: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Default slots fallback
  const defaultSlots = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"];

  // Local date formatter (avoids UTC timezone shift bug)
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  useEffect(() => {
    // Generate dates starting today in local timezone
    const list = [];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const isoString = formatLocalDate(d);
      list.push({
        dayName: days[d.getDay()],
        dayNum: String(d.getDate()),
        isoString,
      });
    }
    setDates(list);
    if (list.length > 0) {
      setSelectedDate(list[0].isoString);
    }
  }, []);

  // Fetch doctor availability / booked slots
  useEffect(() => {
    if (!doctorId || !selectedDate || !hospitalId) return;

    const fetchAvailability = async () => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      try {
        // Fetch doctor's specific profile to get their configured available slots
        const docRes = await authFetch(`/hospitals/${hospitalId}/doctors`);
        let doctorSlots = defaultSlots;
        if (docRes.ok) {
          const docs = await docRes.json();
          const doc = docs.find((d: any) => d.id === doctorId);
          if (doc && doc.availableSlots && doc.availableSlots.length > 0) {
            doctorSlots = doc.availableSlots;
          }
        }
        setAvailableSlots(doctorSlots);

        // Fetch already booked appointments for this doctor to gray them out
        const apptsRes = await authFetch(`/hospitals/${hospitalId}/appointments?doctorId=${doctorId}`);
        if (apptsRes.ok) {
          const appts: SlotResponse[] = await apptsRes.json();
          const booked = new Set(
            appts
              .filter((a) => a.appointmentDate === selectedDate && a.status !== 'CANCELLED')
              .map((a) => a.timeSlot)
          );
          setBookedSlots(booked);
        }
      } catch (error) {
        console.error('Error fetching availability:', error);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchAvailability();
  }, [doctorId, selectedDate, hospitalId]);

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

  const handleBookingConfirm = async () => {
    if (!selectedSlot) {
      Alert.alert('Selection Required', 'Please select a time slot.');
      return;
    }

    setBookingLoading(true);
    try {
      const res = await authFetch(`/hospitals/${hospitalId}/appointments/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          appointmentDate: selectedDate,
          timeSlot: selectedSlot,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Could not complete appointment booking.');
      }

      const savedAppt = await res.json();
      Alert.alert(
        '🎉 Booking Confirmed',
        `Doctor: ${savedAppt.doctorName}\nRoom: ${roomNumber || '302'}\nToken Number: ${savedAppt.queueNumber}\nTime: ${selectedDate} at ${formatSlotTime(selectedSlot)}`,
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/(tabs)');
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Booking Failed', error.message || 'Connection error.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#38BDF8" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Booking</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Doctor Summary Card */}
        <View style={styles.doctorSummaryCard}>
          <Text style={styles.summaryTitle}>Consulting Doctor</Text>
          <Text style={styles.docName}>{doctorName || 'Doctor'}</Text>
          <Text style={styles.docSpecialty}>
            {specialty || 'General Medicine'} &bull; Room {roomNumber || '302'}
          </Text>
        </View>

        {/* Date Selector */}
        <Text style={styles.sectionHeading}>Select Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.calendarStrip}
        >
          {dates.map((item) => {
            const isSelected = selectedDate === item.isoString;
            return (
              <TouchableOpacity
                key={item.isoString}
                style={[styles.dateCell, isSelected && styles.dateCellActive]}
                onPress={() => setSelectedDate(item.isoString)}
              >
                <Text style={[styles.dayNameText, isSelected && styles.dayNameTextActive]}>
                  {item.dayName}
                </Text>
                <Text style={[styles.dayNumText, isSelected && styles.dayNumTextActive]}>
                  {item.dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Slots Grid */}
        <Text style={styles.sectionHeading}>Available Slots</Text>
        {loadingSlots ? (
          <View style={styles.centeredBlock}>
            <ActivityIndicator size="large" color="#38BDF8" />
            <Text style={styles.loadingText}>Fetching available times...</Text>
          </View>
        ) : (
          <View style={styles.slotsGrid}>
            {availableSlots.map((slot) => {
              const isBooked = bookedSlots.has(slot);
              const isSelected = selectedSlot === slot;
              
              // Check if slot has already passed for today
              const isToday = selectedDate === formatLocalDate(new Date());
              const now = new Date();
              const [sh, sm] = slot.split(':').map(Number);
              const isPast = isToday && (sh < now.getHours() || (sh === now.getHours() && sm <= now.getMinutes()));

              if (isPast) {
                return (
                  <View key={slot} style={[styles.slotCell, styles.slotCellBooked]}>
                    <Text style={styles.slotTextBooked}>{formatSlotTime(slot)}</Text>
                    <Text style={[styles.bookedBadge, { color: '#64748B' }]}>Passed</Text>
                  </View>
                );
              }

              if (isBooked) {
                return (
                  <View key={slot} style={[styles.slotCell, styles.slotCellBooked]}>
                    <Text style={styles.slotTextBooked}>{formatSlotTime(slot)}</Text>
                    <Text style={styles.bookedBadge}>Booked</Text>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={slot}
                  style={[styles.slotCell, isSelected && styles.slotCellActive]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Text style={[styles.slotText, isSelected && styles.slotTextActive]}>
                    {formatSlotTime(slot)}
                  </Text>
                  <Text style={[styles.availableBadge, isSelected && styles.availableBadgeActive]}>
                    Available
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Footer Booking button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btnConfirm, (!selectedSlot || bookingLoading) && styles.btnConfirmDisabled]}
          onPress={handleBookingConfirm}
          disabled={!selectedSlot || bookingLoading}
        >
          {bookingLoading ? (
            <ActivityIndicator color="#090D16" />
          ) : (
            <Text style={styles.btnConfirmText}>Confirm Booking & Receive Ticket</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  backBtnText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  doctorSummaryCard: {
    backgroundColor: 'rgba(26, 36, 56, 0.75)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#38BDF8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  docName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  docSpecialty: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  calendarStrip: {
    paddingVertical: 4,
    gap: 10,
    marginBottom: 20,
  },
  dateCell: {
    width: 54,
    height: 70,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateCellActive: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  dayNameText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  dayNameTextActive: {
    color: '#090D16',
    fontWeight: '700',
  },
  dayNumText: {
    fontSize: 18,
    color: '#F8FAFC',
    fontWeight: '700',
    marginTop: 4,
  },
  dayNumTextActive: {
    color: '#090D16',
  },
  centeredBlock: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 10,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  slotCell: {
    width: '30%',
    aspectRatio: 1.6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  slotCellActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  slotCellBooked: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderColor: 'rgba(255, 255, 255, 0.02)',
    opacity: 0.4,
  },
  slotText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  slotTextActive: {
    color: '#38BDF8',
  },
  slotTextBooked: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    textDecorationLine: 'line-through',
  },
  availableBadge: {
    fontSize: 9,
    fontWeight: '600',
    color: '#34D399',
    marginTop: 4,
  },
  availableBadgeActive: {
    color: '#38BDF8',
  },
  bookedBadge: {
    fontSize: 9,
    fontWeight: '600',
    color: '#F87171',
    marginTop: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#090D16',
  },
  btnConfirm: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#38BDF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConfirmDisabled: {
    backgroundColor: '#1E293B',
    opacity: 0.5,
  },
  btnConfirmText: {
    color: '#090D16',
    fontWeight: '700',
    fontSize: 14,
  },
});
