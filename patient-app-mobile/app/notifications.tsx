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
import { useAuth } from '../context/AuthContext';
import { authFetch } from '../utils/api';
import { useRouter } from 'expo-router';
import { connectWebSocket, subscribeToNotifications } from '../utils/websocket';

interface NotificationItem {
  id: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsScreen() {
  const { hospitalId, user, token } = useAuth();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!hospitalId) return;

    try {
      const url = user?.userId
        ? `/hospitals/${hospitalId}/notifications?userId=${encodeURIComponent(user.userId)}`
        : `/hospitals/${hospitalId}/notifications`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        // Sort newest first
        const sorted = (data || []).sort((a: any, b: any) => {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        setNotifications(sorted);
      }
    } catch (e) {
      console.error('Error fetching notifications:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hospitalId, user?.userId]);

  useEffect(() => {
    fetchNotifications();

    if (token && hospitalId && user?.userId) {
      connectWebSocket(token, () => {
        subscribeToNotifications(hospitalId, user.userId, () => {
          fetchNotifications();
        });
      });
    }
  }, [fetchNotifications, token, hospitalId, user?.userId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    if (!hospitalId) return;
    try {
      const url = user?.userId
        ? `/hospitals/${hospitalId}/notifications/read-all?userId=${encodeURIComponent(user.userId)}`
        : `/hospitals/${hospitalId}/notifications/read-all`;
      const res = await authFetch(url, {
        method: 'POST',
      });
      if (res.ok) {
        fetchNotifications();
      } else {
        console.error('Failed to mark all as read');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationPress = async (id: string, isRead: boolean) => {
    if (isRead) return;
    try {
      const res = await authFetch(`/hospitals/${hospitalId}/notifications/${id}/read`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchNotifications();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      if (!timeStr) return '';
      const d = new Date(timeStr);
      // Format to readable time, e.g. "Aug 31, 03:22 PM"
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      const day = d.getDate();
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#38BDF8" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Subheader action */}
      <View style={styles.subHeader}>
        <Text style={styles.subTitle}>Recent alerts</Text>
        {notifications.some(n => !n.read) && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={60} color="#64748B" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No new notifications</Text>
            <Text style={styles.emptySubtitle}>You are all caught up!</Text>
          </View>
        ) : (
          notifications.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.notifCard, !item.read && styles.notifCardUnread]}
              onPress={() => handleNotificationPress(item.id, item.read)}
              activeOpacity={item.read ? 1 : 0.7}
            >
              <View style={styles.notifHeader}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={item.read ? 'mail-open-outline' : 'mail-unread'}
                    size={16}
                    color={item.read ? '#94A3B8' : '#38BDF8'}
                  />
                </View>
                <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
              </View>
              
              <Text style={[styles.messageText, !item.read && styles.messageTextUnread]}>
                {item.message}
              </Text>

              {!item.read && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>New</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
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
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  subTitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  markReadText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    paddingVertical: 64,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  notifCard: {
    backgroundColor: 'rgba(26, 36, 56, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    position: 'relative',
  },
  notifCardUnread: {
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    marginRight: 6,
  },
  timeText: {
    fontSize: 10,
    color: '#64748B',
  },
  messageText: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  messageTextUnread: {
    color: '#F8FAFC',
    fontWeight: '500',
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: 10,
    backgroundColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#090D16',
  },
});
