import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const API_BASE = 'https://whitesmoke-jay-438498.hostingersite.com/api/v1';
const DELIVERY_PINCODES = ['788001', '788002', '788003', '788004', '788005'];
const TOKEN_KEY = 'cheesy_mobile_token';
const REFRESH_KEY = 'cheesy_mobile_refresh';

type Screen = 'menu' | 'cart' | 'booking' | 'orders' | 'profile';
type OrderType = 'delivery' | 'takeaway';

type MenuItem = {
  id: string;
  _id?: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  image_url?: string;
  img?: string;
  is_available?: boolean;
};

type CartItem = MenuItem & {
  quantity: number;
  item_id: string;
};

type Session = {
  access_token: string;
  refresh_token?: string;
  name?: string;
  email?: string;
  phone?: string;
};

type ApiError = Error & { status?: number };

type PaymentState = {
  orderId: string;
  orderNumber: string;
  amount: number;
  razorpayOrderId: string;
  razorpayKey: string;
};

type Notice = {
  type: 'success' | 'error' | 'info';
  message: string;
};

async function getStoredValue(key: string) {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string) {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteStoredValue(key: string) {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function price(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeMenuItem(item: any): MenuItem {
  return {
    id: String(item.id || item._id),
    _id: item._id,
    name: item.name,
    category: item.category,
    price: Number(item.price || 0),
    description: item.description || '',
    image_url: item.image_url || item.img || 'https://via.placeholder.com/400',
    is_available: item.is_available !== false,
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '').slice(-10);
}

function normalizePincode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

function isDeliveryPincodeAllowed(value: string) {
  return DELIVERY_PINCODES.includes(normalizePincode(value));
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch {
    const error: ApiError = new Error('Unable to reach the server. Check your internet connection.');
    throw error;
  }

  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    const error: ApiError = new Error(data?.detail || data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
      {action}
    </View>
  );
}

function NoticeBar({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null;
  return (
    <Pressable onPress={onDismiss} style={[styles.notice, notice.type === 'error' ? styles.noticeError : notice.type === 'success' ? styles.noticeSuccess : styles.noticeInfo]}>
      <Text style={styles.noticeText}>{notice.message}</Text>
    </Pressable>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authVisible, setAuthVisible] = useState(false);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = useCallback((type: Notice['type'], message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4500);
  }, []);

  const authedRequest = useCallback(<T,>(endpoint: string, options: RequestInit = {}) => {
    return apiRequest<T>(endpoint, options, token);
  }, [token]);

  const loadMenu = useCallback(async () => {
    const response = await apiRequest<{ items: any[] }>('/menu?available_only=true&per_page=100');
    setMenu((response.items || []).map(normalizeMenuItem));
  }, []);

  const loadOrders = useCallback(async () => {
    if (!token) {
      setOrders([]);
      return;
    }
    const response = await authedRequest<{ orders: any[] }>('/orders/user');
    setOrders(response.orders || []);
  }, [authedRequest, token]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const savedToken = await getStoredValue(TOKEN_KEY);
      const savedRefresh = await getStoredValue(REFRESH_KEY);
      if (savedToken) {
        setToken(savedToken);
        setSession((current) => current || { access_token: savedToken, refresh_token: savedRefresh || undefined });
      }
      await loadMenu();
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to load app data.');
    } finally {
      setLoading(false);
    }
  }, [loadMenu, showNotice]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (screen === 'orders') loadOrders().catch((error) => showNotice('error', error.message));
  }, [screen, loadOrders, showNotice]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadMenu();
      if (screen === 'orders') await loadOrders();
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }, [loadMenu, loadOrders, screen, showNotice]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function addToCart(item: MenuItem) {
    setCart((current) => {
      const found = current.find((entry) => entry.item_id === item.id);
      if (found) {
        return current.map((entry) => entry.item_id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry);
      }
      return [...current, { ...item, item_id: item.id, quantity: 1 }];
    });
    showNotice('success', `${item.name} added to cart.`);
  }

  function changeCartQty(itemId: string, delta: number) {
    setCart((current) => current
      .map((item) => item.item_id === itemId ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  async function saveSession(nextSession: Session) {
    setSession(nextSession);
    setToken(nextSession.access_token);
    await setStoredValue(TOKEN_KEY, nextSession.access_token);
    if (nextSession.refresh_token) await setStoredValue(REFRESH_KEY, nextSession.refresh_token);
  }

  async function logout() {
    await deleteStoredValue(TOKEN_KEY);
    await deleteStoredValue(REFRESH_KEY);
    setToken(null);
    setSession(null);
    setOrders([]);
    showNotice('info', 'Signed out.');
  }

  async function checkout(orderType: OrderType, address: string, pincode: string) {
    if (!token) {
      setAuthVisible(true);
      showNotice('info', 'Sign in to place your order.');
      return;
    }
    if (!cart.length) {
      showNotice('error', 'Your cart is empty.');
      return;
    }
    if (orderType === 'delivery') {
      if (!address.trim()) {
        showNotice('error', 'Delivery address is required.');
        return;
      }
      if (!isDeliveryPincodeAllowed(pincode)) {
        showNotice('error', 'Delivery is only available for PIN codes 788001, 788002, 788003, 788004 and 788005. Choose takeaway or book a table.');
        return;
      }
    }

    const payload = {
      items: cart.map((item) => ({
        item_id: item.item_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image_url: item.image_url,
      })),
      order_type: orderType,
      address: orderType === 'delivery' ? address : null,
      pincode: orderType === 'delivery' ? normalizePincode(pincode) : null,
    };

    const order = await authedRequest<any>('/orders/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const paymentOrder = await authedRequest<any>('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: order.total, order_id: order.order_id }),
    });
    setPayment({
      orderId: order.order_id,
      orderNumber: order.order_number,
      amount: paymentOrder.amount,
      razorpayOrderId: paymentOrder.razorpay_order_id,
      razorpayKey: paymentOrder.razorpay_key,
    });
  }

  async function verifyPayment(data: any) {
    if (!payment) return;
    await authedRequest('/payment/verify', {
      method: 'POST',
      body: JSON.stringify({
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_order_id: data.razorpay_order_id,
        razorpay_signature: data.razorpay_signature,
        order_id: payment.orderId,
      }),
    });
    setPayment(null);
    setCart([]);
    showNotice('success', 'Payment successful. Order confirmed.');
    setScreen('orders');
    await loadOrders();
  }

  async function createReservation(form: ReservationForm) {
    const response = await apiRequest<any>('/reservation', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        date: form.date,
        time: form.time,
        guests: Number(form.guests),
        special_requests: form.specialRequests || null,
        preorder_items: [],
      }),
    }, token);
    showNotice('success', response.message || 'Table booking received.');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingShell}>
        <ActivityIndicator color="#cda45e" size="large" />
        <Text style={styles.loadingText}>Preparing Cheesy Crust Co.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Cheesy Crust Co.</Text>
          <Text style={styles.subBrand}>Silchar ordering and table booking</Text>
        </View>
        <Pressable style={styles.authPill} onPress={() => token ? logout() : setAuthVisible(true)}>
          <Text style={styles.authPillText}>{token ? 'Logout' : 'Login'}</Text>
        </Pressable>
      </View>

      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />

      <View style={styles.content}>
        {screen === 'menu' ? (
          <MenuScreen menu={menu} cartCount={cartCount} onAdd={addToCart} refreshing={refreshing} onRefresh={refresh} />
        ) : null}
        {screen === 'cart' ? (
          <CartScreen cart={cart} total={cartTotal} onQty={changeCartQty} onCheckout={checkout} busy={Boolean(payment)} />
        ) : null}
        {screen === 'booking' ? <BookingScreen onSubmit={createReservation} /> : null}
        {screen === 'orders' ? (
          <OrdersScreen orders={orders} token={token} onLogin={() => setAuthVisible(true)} onRefresh={loadOrders} />
        ) : null}
        {screen === 'profile' ? <ProfileScreen session={session} token={token} onLogin={() => setAuthVisible(true)} /> : null}
      </View>

      <View style={styles.nav}>
        {([
          ['menu', 'Menu'],
          ['cart', `Cart${cartCount ? ` ${cartCount}` : ''}`],
          ['booking', 'Book'],
          ['orders', 'Orders'],
          ['profile', 'Profile'],
        ] as [Screen, string][]).map(([key, label]) => (
          <Pressable key={key} style={[styles.navButton, screen === key && styles.navButtonActive]} onPress={() => setScreen(key)}>
            <Text style={[styles.navText, screen === key && styles.navTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} onSession={saveSession} />
      <PaymentModal payment={payment} onClose={() => setPayment(null)} onSuccess={verifyPayment} onFailure={(message) => showNotice('error', message)} />
    </SafeAreaView>
  );
}

function MenuScreen({
  menu,
  cartCount,
  onAdd,
  refreshing,
  onRefresh,
}: {
  menu: MenuItem[];
  cartCount: number;
  onAdd: (item: MenuItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [category, setCategory] = useState('all');
  const categories = useMemo(() => ['all', ...Array.from(new Set(menu.map((item) => item.category)))], [menu]);
  const filtered = category === 'all' ? menu : menu.filter((item) => item.category === category);

  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Menu</Text>
      <Text style={styles.screenSubtitle}>{cartCount ? `${cartCount} item${cartCount > 1 ? 's' : ''} in cart` : 'Choose your favorites'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRail}>
        {categories.map((cat) => (
          <Pressable key={cat} style={[styles.categoryChip, category === cat && styles.categoryChipActive]} onPress={() => setCategory(cat)}>
            <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat === 'all' ? 'All' : cat}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#cda45e" />}
        ListEmptyComponent={<EmptyState title="No menu items" detail="Pull to refresh or try again in a moment." />}
        renderItem={({ item }) => (
          <View style={styles.menuCard}>
            <Image source={{ uri: item.image_url || item.img }} style={styles.menuImage} />
            <View style={styles.menuBody}>
              <Text style={styles.menuName}>{item.name}</Text>
              <Text style={styles.menuDescription} numberOfLines={2}>{item.description}</Text>
              <View style={styles.rowBetween}>
                <Text style={styles.menuPrice}>{price(item.price)}</Text>
                <Pressable style={styles.primaryButtonSmall} onPress={() => onAdd(item)}>
                  <Text style={styles.primaryButtonText}>Add</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function CartScreen({
  cart,
  total,
  onQty,
  onCheckout,
  busy,
}: {
  cart: CartItem[];
  total: number;
  onQty: (itemId: string, delta: number) => void;
  onCheckout: (type: OrderType, address: string, pincode: string) => Promise<void>;
  busy: boolean;
}) {
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const deliveryFee = orderType === 'delivery' ? 40 : 0;

  async function submit() {
    setSubmitting(true);
    try {
      await onCheckout(orderType, address, pincode);
    } catch (error) {
      Alert.alert('Checkout', error instanceof Error ? error.message : 'Could not start checkout.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!cart.length) {
    return <EmptyState title="Your cart is empty" detail="Add menu items before checkout." />;
  }

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>Cart</Text>
      {cart.map((item) => (
        <View key={item.item_id} style={styles.cartRow}>
          <View style={styles.cartInfo}>
            <Text style={styles.cartName}>{item.name}</Text>
            <Text style={styles.cartMeta}>{price(item.price)} each</Text>
          </View>
          <View style={styles.qtyGroup}>
            <Pressable style={styles.qtyButton} onPress={() => onQty(item.item_id, -1)}><Text style={styles.qtyText}>-</Text></Pressable>
            <Text style={styles.qtyCount}>{item.quantity}</Text>
            <Pressable style={styles.qtyButton} onPress={() => onQty(item.item_id, 1)}><Text style={styles.qtyText}>+</Text></Pressable>
          </View>
        </View>
      ))}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Order Type</Text>
        <View style={styles.segment}>
          {(['delivery', 'takeaway'] as OrderType[]).map((type) => (
            <Pressable key={type} style={[styles.segmentButton, orderType === type && styles.segmentButtonActive]} onPress={() => setOrderType(type)}>
              <Text style={[styles.segmentText, orderType === type && styles.segmentTextActive]}>{type === 'delivery' ? 'Delivery' : 'Takeaway'}</Text>
            </Pressable>
          ))}
        </View>

        {orderType === 'delivery' ? (
          <>
            <TextInput style={styles.input} placeholder="Full delivery address" placeholderTextColor="#817767" value={address} onChangeText={setAddress} multiline />
            <TextInput style={styles.input} placeholder="Delivery PIN code" placeholderTextColor="#817767" keyboardType="number-pad" maxLength={6} value={pincode} onChangeText={(value) => setPincode(normalizePincode(value))} />
            <Text style={styles.helpText}>Delivery only for 788001, 788002, 788003, 788004 and 788005. Others can choose takeaway or book a table.</Text>
          </>
        ) : null}

        <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{price(total)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Delivery</Text><Text style={styles.totalValue}>{price(deliveryFee)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{price(total + deliveryFee)}</Text></View>
        <Pressable disabled={submitting || busy} style={[styles.primaryButton, (submitting || busy) && styles.disabledButton]} onPress={submit}>
          {submitting || busy ? <ActivityIndicator color="#120f0a" /> : <Text style={styles.primaryButtonText}>Proceed to Payment</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

type ReservationForm = {
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: string;
  specialRequests: string;
};

function BookingScreen({ onSubmit }: { onSubmit: (form: ReservationForm) => Promise<void> }) {
  const [form, setForm] = useState<ReservationForm>({
    name: '',
    phone: '',
    date: new Date().toISOString().slice(0, 10),
    time: '19:00',
    guests: '2',
    specialRequests: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof ReservationForm>(key: K, value: ReservationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!form.name.trim() || normalizePhone(form.phone).length !== 10 || !form.date || !form.time) {
      Alert.alert('Booking', 'Please enter name, 10-digit mobile number, date and time.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm((current) => ({ ...current, specialRequests: '' }));
    } catch (error) {
      Alert.alert('Booking failed', error instanceof Error ? error.message : 'Could not book table.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>Book Table</Text>
      <Text style={styles.screenSubtitle}>Reserve a table without placing a delivery order.</Text>
      <View style={styles.panel}>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#817767" value={form.name} onChangeText={(value) => update('name', value)} />
        <TextInput style={styles.input} placeholder="Mobile number" placeholderTextColor="#817767" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => update('phone', value)} />
        <TextInput style={styles.input} placeholder="Date YYYY-MM-DD" placeholderTextColor="#817767" value={form.date} onChangeText={(value) => update('date', value)} />
        <TextInput style={styles.input} placeholder="Time HH:mm" placeholderTextColor="#817767" value={form.time} onChangeText={(value) => update('time', value)} />
        <TextInput style={styles.input} placeholder="Guests" placeholderTextColor="#817767" keyboardType="number-pad" value={form.guests} onChangeText={(value) => update('guests', value.replace(/\D/g, '').slice(0, 2))} />
        <TextInput style={styles.input} placeholder="Special requests" placeholderTextColor="#817767" value={form.specialRequests} onChangeText={(value) => update('specialRequests', value)} multiline />
        <Pressable style={[styles.primaryButton, submitting && styles.disabledButton]} disabled={submitting} onPress={submit}>
          {submitting ? <ActivityIndicator color="#120f0a" /> : <Text style={styles.primaryButtonText}>Request Booking</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function OrdersScreen({ orders, token, onLogin, onRefresh }: { orders: any[]; token: string | null; onLogin: () => void; onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (!token) {
    return <EmptyState title="Sign in to see orders" detail="Your order history is linked to your account." action={<Pressable style={styles.primaryButtonSmall} onPress={onLogin}><Text style={styles.primaryButtonText}>Login</Text></Pressable>} />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Orders</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id || item._id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#cda45e" />}
        ListEmptyComponent={<EmptyState title="No orders yet" detail="Your confirmed orders will appear here." />}
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.orderNumber}>{item.order_number || `Order #${item.id}`}</Text>
              <Text style={styles.statusBadge}>{item.status}</Text>
            </View>
            <Text style={styles.orderMeta}>{item.order_type} · {item.payment_status}</Text>
            <Text style={styles.orderTotal}>{price(Number(item.total || 0))}</Text>
          </View>
        )}
      />
    </View>
  );
}

function ProfileScreen({ session, token, onLogin }: { session: Session | null; token: string | null; onLogin: () => void }) {
  if (!token) {
    return <EmptyState title="Your profile" detail="Login or create an account to manage orders." action={<Pressable style={styles.primaryButtonSmall} onPress={onLogin}><Text style={styles.primaryButtonText}>Login</Text></Pressable>} />;
  }
  return (
    <View style={styles.screen}>
      <Text style={styles.screenTitle}>Profile</Text>
      <View style={styles.panel}>
        <Text style={styles.profileName}>{session?.name || 'Customer'}</Text>
        <Text style={styles.profileLine}>{session?.email || 'Email saved after login'}</Text>
        <Text style={styles.profileLine}>{session?.phone || 'Mobile saved after login'}</Text>
        <Text style={styles.helpText}>Delivery is restricted by PIN code. Customers outside the delivery area can still use takeaway or book a table.</Text>
      </View>
    </View>
  );
}

function AuthModal({ visible, onClose, onSession }: { visible: boolean; onClose: () => void; onSession: (session: Session) => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!identifier.trim() || !password) {
      Alert.alert('Authentication', 'Enter email/mobile and password.');
      return;
    }
    if (mode === 'register' && (!name.trim() || normalizePhone(phone).length !== 10 || password.length < 8)) {
      Alert.alert('Registration', 'Enter name, 10-digit mobile number, email and an 8+ character password.');
      return;
    }
    setSubmitting(true);
    try {
      const session = mode === 'login'
        ? await apiRequest<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })
        : await apiRequest<Session>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email: identifier, phone, password }) });
      await onSession(session);
      onClose();
    } catch (error) {
      Alert.alert('Authentication failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.modalTitle}>{mode === 'login' ? 'Welcome Back' : 'Create Account'}</Text>
            <Pressable onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable>
          </View>
          {mode === 'register' ? <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#817767" value={name} onChangeText={setName} /> : null}
          <TextInput style={styles.input} placeholder="Email or mobile" placeholderTextColor="#817767" autoCapitalize="none" value={identifier} onChangeText={setIdentifier} />
          {mode === 'register' ? <TextInput style={styles.input} placeholder="Mobile number" placeholderTextColor="#817767" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /> : null}
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#817767" secureTextEntry value={password} onChangeText={setPassword} />
          <Pressable style={[styles.primaryButton, submitting && styles.disabledButton]} disabled={submitting} onPress={submit}>
            {submitting ? <ActivityIndicator color="#120f0a" /> : <Text style={styles.primaryButtonText}>{mode === 'login' ? 'Login' : 'Register'}</Text>}
          </Pressable>
          <Pressable onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
            <Text style={styles.switchText}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Login'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PaymentModal({
  payment,
  onClose,
  onSuccess,
  onFailure,
}: {
  payment: PaymentState | null;
  onClose: () => void;
  onSuccess: (data: any) => Promise<void>;
  onFailure: (message: string) => void;
}) {
  const [verifying, setVerifying] = useState(false);
  if (!payment) return null;

  const html = `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="background:#120f0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
  <div><h3>Opening Razorpay...</h3><p>Please complete the payment securely.</p></div>
  <script>
    function send(type, payload) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} })); }
    var options = {
      key: "${payment.razorpayKey}",
      amount: ${payment.amount},
      currency: "INR",
      name: "Cheesy Crust Co.",
      description: "Order #${payment.orderNumber}",
      order_id: "${payment.razorpayOrderId}",
      theme: { color: "#cda45e" },
      handler: function(response) { send("success", response); },
      modal: { ondismiss: function() { send("dismiss", {}); } }
    };
    var rzp = new Razorpay(options);
    rzp.on("payment.failed", function(response) { send("failed", response); });
    rzp.open();
  </script>
</body>
</html>`;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.paymentShell}>
        <View style={styles.paymentHeader}>
          <Text style={styles.paymentTitle}>Secure Payment</Text>
          <Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable>
        </View>
        {verifying ? (
          <View style={styles.loadingShell}><ActivityIndicator color="#cda45e" size="large" /><Text style={styles.loadingText}>Verifying payment...</Text></View>
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            onMessage={async (event) => {
              const message = safeJson(event.nativeEvent.data);
              if (message.type === 'success') {
                setVerifying(true);
                try {
                  await onSuccess(message.payload);
                } catch (error) {
                  onFailure(error instanceof Error ? error.message : 'Payment verification failed.');
                } finally {
                  setVerifying(false);
                }
              }
              if (message.type === 'failed') {
                onFailure(message.payload?.error?.description || 'Payment failed. Try another method.');
              }
              if (message.type === 'dismiss') onClose();
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#120f0a' },
  loadingShell: { flex: 1, backgroundColor: '#120f0a', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#cda45e', fontSize: 15 },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#292217' },
  brand: { color: '#f6e6c6', fontSize: 24, fontWeight: '800' },
  subBrand: { color: '#9d927d', marginTop: 3 },
  authPill: { borderWidth: 1, borderColor: '#cda45e', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  authPillText: { color: '#cda45e', fontWeight: '700' },
  content: { flex: 1 },
  screen: { flex: 1, padding: 16 },
  screenTitle: { color: '#f6e6c6', fontSize: 26, fontWeight: '800' },
  screenSubtitle: { color: '#9d927d', marginTop: 4, marginBottom: 12 },
  categoryRail: { maxHeight: 50, marginVertical: 12 },
  categoryChip: { height: 38, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: '#2f271b', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  categoryChipActive: { backgroundColor: '#cda45e', borderColor: '#cda45e' },
  categoryText: { color: '#cda45e', textTransform: 'capitalize', fontWeight: '700' },
  categoryTextActive: { color: '#120f0a' },
  menuCard: { backgroundColor: '#1a1814', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#2c2418', marginBottom: 14 },
  menuImage: { height: 150, width: '100%', backgroundColor: '#292217' },
  menuBody: { padding: 14 },
  menuName: { color: '#f6e6c6', fontSize: 18, fontWeight: '800' },
  menuDescription: { color: '#9d927d', marginTop: 5, minHeight: 38 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuPrice: { color: '#cda45e', fontSize: 18, fontWeight: '800' },
  primaryButton: { backgroundColor: '#cda45e', minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 14 },
  primaryButtonSmall: { backgroundColor: '#cda45e', minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryButtonText: { color: '#120f0a', fontWeight: '900' },
  disabledButton: { opacity: 0.6 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { color: '#f6e6c6', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  emptyDetail: { color: '#9d927d', textAlign: 'center', marginTop: 8, marginBottom: 18, lineHeight: 20 },
  cartRow: { backgroundColor: '#1a1814', borderRadius: 8, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#2c2418' },
  cartInfo: { flex: 1, paddingRight: 12 },
  cartName: { color: '#f6e6c6', fontWeight: '800', fontSize: 16 },
  cartMeta: { color: '#9d927d', marginTop: 4 },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyButton: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#cda45e', alignItems: 'center', justifyContent: 'center' },
  qtyText: { color: '#cda45e', fontSize: 20, fontWeight: '900' },
  qtyCount: { color: '#f6e6c6', minWidth: 22, textAlign: 'center', fontWeight: '800' },
  panel: { backgroundColor: '#1a1814', borderRadius: 8, borderWidth: 1, borderColor: '#2c2418', padding: 14, marginTop: 10 },
  panelTitle: { color: '#f6e6c6', fontSize: 17, fontWeight: '800', marginBottom: 10 },
  segment: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: '#2f271b', overflow: 'hidden', marginBottom: 12 },
  segmentButton: { flex: 1, padding: 12, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: '#cda45e' },
  segmentText: { color: '#cda45e', fontWeight: '800' },
  segmentTextActive: { color: '#120f0a' },
  input: { minHeight: 48, color: '#f6e6c6', borderWidth: 1, borderColor: '#3a352e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, backgroundColor: '#0c0b09' },
  helpText: { color: '#9d927d', lineHeight: 19, marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  totalLabel: { color: '#9d927d' },
  totalValue: { color: '#f6e6c6', fontWeight: '700' },
  grandLabel: { color: '#f6e6c6', fontSize: 18, fontWeight: '900' },
  grandValue: { color: '#cda45e', fontSize: 18, fontWeight: '900' },
  nav: { flexDirection: 'row', padding: 8, borderTopWidth: 1, borderTopColor: '#292217', backgroundColor: '#16130f' },
  navButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  navButtonActive: { backgroundColor: '#2b2318' },
  navText: { color: '#8f836f', fontWeight: '800', fontSize: 12 },
  navTextActive: { color: '#cda45e' },
  orderCard: { backgroundColor: '#1a1814', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#2c2418', marginBottom: 12 },
  orderNumber: { color: '#f6e6c6', fontWeight: '900' },
  statusBadge: { color: '#120f0a', backgroundColor: '#cda45e', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', fontWeight: '900' },
  orderMeta: { color: '#9d927d', textTransform: 'capitalize', marginTop: 6 },
  orderTotal: { color: '#cda45e', fontSize: 18, fontWeight: '900', marginTop: 8 },
  profileName: { color: '#f6e6c6', fontSize: 22, fontWeight: '900' },
  profileLine: { color: '#9d927d', marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1a1814', padding: 18, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: '#2c2418' },
  modalTitle: { color: '#f6e6c6', fontSize: 22, fontWeight: '900', marginBottom: 16 },
  closeText: { color: '#cda45e', fontWeight: '800' },
  switchText: { color: '#cda45e', textAlign: 'center', marginTop: 16, fontWeight: '800' },
  notice: { marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 8 },
  noticeError: { backgroundColor: '#5b1f1f' },
  noticeSuccess: { backgroundColor: '#1f4a2e' },
  noticeInfo: { backgroundColor: '#2b2318' },
  noticeText: { color: '#fff', fontWeight: '700' },
  paymentShell: { flex: 1, backgroundColor: '#120f0a' },
  paymentHeader: { height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#292217' },
  paymentTitle: { color: '#f6e6c6', fontWeight: '900', fontSize: 18 },
});
