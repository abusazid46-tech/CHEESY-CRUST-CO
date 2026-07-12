import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import * as SecureStore from 'expo-secure-store';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const API_BASE = 'https://whitesmoke-jay-438498.hostingersite.com/api/v1';
const DELIVERY_PINCODES = ['788001', '788002', '788003', '788004', '788005'];
const TOKEN_KEY = 'cheesy_mobile_token';
const REFRESH_KEY = 'cheesy_mobile_refresh';
const BRAND_LOGO = require('./assets/website-logo.png');
const DEFAULT_BUSINESS_SETTINGS = {
  deliveryFee: 40,
  freeDeliveryThreshold: 500,
  minOrderAmount: 100,
  deliveryRadius: 10,
  maxGuests: 8,
};

type Screen = 'menu' | 'cart' | 'booking' | 'orders' | 'profile';
type OrderType = 'delivery' | 'takeaway';
type NavIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

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

type PreorderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type BusinessSettings = typeof DEFAULT_BUSINESS_SETTINGS;

type Offer = {
  id: string;
  title: string;
  description: string;
  code: string;
  imageUrl: string;
  discountType: 'percentage' | 'flat' | 'bogo' | string;
  discountValue: number;
  minOrder: number;
  startDate?: string | null;
  endDate?: string | null;
  is_active: boolean;
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
  orderId?: string;
  reservationId?: string;
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

function normalizeOffer(offer: any): Offer {
  const data = offer.data || {};
  return {
    id: String(offer.id || offer._id || ''),
    title: offer.title || data.title || 'Offer',
    description: offer.description || data.description || '',
    code: String(offer.code || data.code || '').trim().toUpperCase(),
    imageUrl: offer.imageUrl || offer.image_url || data.imageUrl || data.image_url || '',
    discountType: offer.discountType || offer.discount_type || data.discountType || data.discount_type || 'percentage',
    discountValue: Number(offer.discountValue ?? offer.discount_value ?? data.discountValue ?? data.discount_value ?? 0),
    minOrder: Number(offer.minOrder ?? offer.min_order ?? data.minOrder ?? data.min_order ?? 0),
    startDate: offer.startDate || data.startDate || null,
    endDate: offer.endDate || data.endDate || null,
    is_active: offer.is_active !== false,
  };
}

function isOfferInDate(offer: Offer) {
  if (!offer.is_active) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (offer.startDate) {
    const start = new Date(offer.startDate);
    start.setHours(0, 0, 0, 0);
    if (today < start) return false;
  }
  if (offer.endDate) {
    const end = new Date(offer.endDate);
    end.setHours(23, 59, 59, 999);
    if (today > end) return false;
  }
  return true;
}

function offerDiscount(offer: Offer | null, total: number, cart: CartItem[]) {
  if (!offer || !isOfferInDate(offer) || total < offer.minOrder) return 0;
  if (offer.discountType === 'bogo') {
    const prices: number[] = [];
    cart.forEach((item) => {
      for (let i = 0; i < item.quantity; i += 1) prices.push(Number(item.price || 0));
    });
    return prices.length >= 2 ? Math.min(...prices) : 0;
  }
  if (offer.discountType === 'percentage') return Math.min(total, Math.round(total * Math.min(offer.discountValue, 100) / 100));
  if (offer.discountType === 'flat') return Math.min(total, offer.discountValue);
  return 0;
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

function LogoMark({ size = 46 }: { size?: number }) {
  return (
    <View style={[styles.logoMark, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={BRAND_LOGO} style={styles.logoImage} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}

function AppShell() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
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

  const loadBusinessSettings = useCallback(async () => {
    const response = await apiRequest<{ settings?: Partial<BusinessSettings> }>('/settings/public');
    setBusinessSettings({ ...DEFAULT_BUSINESS_SETTINGS, ...(response.settings || {}) });
  }, []);

  const loadOffers = useCallback(async () => {
    const response = await apiRequest<{ offers?: any[] }>('/admin/offers/active');
    setOffers((response.offers || []).map(normalizeOffer));
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
      await Promise.all([loadMenu(), loadBusinessSettings(), loadOffers()]);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Failed to load app data.');
    } finally {
      setLoading(false);
    }
  }, [loadBusinessSettings, loadMenu, loadOffers, showNotice]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (screen === 'orders') loadOrders().catch((error) => showNotice('error', error.message));
  }, [screen, loadOrders, showNotice]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadMenu(), loadOffers()]);
      if (screen === 'orders') await loadOrders();
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }, [loadMenu, loadOffers, loadOrders, screen, showNotice]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 0 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;

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

  async function checkout(orderType: OrderType, address: string, pincode: string, promoCode?: string | null) {
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
      promo_code: promoCode || null,
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
        ...(payment.orderId ? { order_id: payment.orderId } : {}),
        ...(payment.reservationId ? { reservation_id: payment.reservationId } : {}),
      }),
    });
    const wasReservation = Boolean(payment.reservationId);
    setPayment(null);
    if (wasReservation) {
      showNotice('success', 'Payment successful. Reservation confirmed.');
      setScreen('booking');
      return;
    }
    setCart([]);
    showNotice('success', 'Payment successful. Order confirmed.');
    setScreen('orders');
    await loadOrders();
  }

  async function createReservation(form: ReservationForm, preorderItems: PreorderItem[]) {
    if (!token) {
      setAuthVisible(true);
      showNotice('info', 'Sign in before confirming a reservation.');
      return;
    }
    const normalizedItems = preorderItems.map((item) => ({
      item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    }));
    const response = await apiRequest<any>('/reservation', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        date: form.date,
        time: form.time,
        guests: Number(form.guests),
        special_requests: form.specialRequests || null,
        preorder_items: normalizedItems,
      }),
    }, token);
    const preorderTotal = preorderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (preorderTotal <= 0) {
      showNotice('success', `Reservation confirmed for ${form.name} on ${form.date} at ${form.time}.`);
      return;
    }
    const paymentOrder = await authedRequest<any>('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({ amount: response.preorder_total || preorderTotal, reservation_id: response.reservation_id }),
    });
    setPayment({
      reservationId: response.reservation_id,
      orderNumber: `Reservation ${form.date} ${form.time}`,
      amount: paymentOrder.amount,
      razorpayOrderId: paymentOrder.razorpay_order_id,
      razorpayKey: paymentOrder.razorpay_key,
    });
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
    <View style={styles.shell}>
      <StatusBar style="light" />
      <NavigationBar style="dark" hidden={false} />
      <View style={[styles.header, { paddingTop: 14 + topInset }]}>
        <View style={styles.headerLeft}>
          <LogoMark />
          <View style={styles.headerCopy}>
            <Text style={styles.brand}>Cheesy Crust Co.</Text>
            <Text style={styles.subBrand}>Silchar ordering and table booking</Text>
          </View>
        </View>
        <Pressable style={styles.authPill} onPress={() => token ? logout() : setAuthVisible(true)}>
          <MaterialCommunityIcons name={token ? 'logout' : 'account-circle-outline'} size={18} color="#120f0a" />
          <Text style={styles.authPillText}>{token ? 'Logout' : 'Login'}</Text>
        </Pressable>
      </View>

      <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />

      <View style={styles.content}>
        {screen === 'menu' ? (
          <MenuScreen menu={menu} cartCount={cartCount} offers={offers} onAdd={addToCart} refreshing={refreshing} onRefresh={refresh} />
        ) : null}
        {screen === 'cart' ? (
          <CartScreen cart={cart} total={cartTotal} settings={businessSettings} offers={offers} onQty={changeCartQty} onCheckout={checkout} busy={Boolean(payment)} />
        ) : null}
        {screen === 'booking' ? <BookingScreen menu={menu} onSubmit={createReservation} /> : null}
        {screen === 'orders' ? (
          <OrdersScreen orders={orders} token={token} onLogin={() => setAuthVisible(true)} onRefresh={loadOrders} />
        ) : null}
        {screen === 'profile' ? <ProfileScreen session={session} token={token} onLogin={() => setAuthVisible(true)} /> : null}
      </View>

      <View style={[styles.nav, { paddingBottom: 10 + Math.max(bottomInset, 8) }]}>
        {([
          ['menu', 'Menu', 'silverware-fork-knife'],
          ['cart', 'Cart', 'shopping-outline'],
          ['booking', 'Book', 'calendar-star'],
          ['orders', 'Orders', 'receipt-text-outline'],
          ['profile', 'Profile', 'account-outline'],
        ] as [Screen, string, NavIconName][]).map(([key, label, icon]) => (
          <Pressable key={key} style={[styles.navButton, screen === key && styles.navButtonActive]} onPress={() => setScreen(key)}>
            <View style={styles.navIconWrap}>
              <MaterialCommunityIcons name={icon} size={22} color={screen === key ? '#120f0a' : '#9d927d'} />
              {key === 'cart' && cartCount ? (
                <View style={styles.navBadge}><Text style={styles.navBadgeText}>{cartCount}</Text></View>
              ) : null}
            </View>
            <Text style={[styles.navText, screen === key && styles.navTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} onSession={saveSession} />
      <PaymentModal payment={payment} onClose={() => setPayment(null)} onSuccess={verifyPayment} onFailure={(message) => showNotice('error', message)} />
    </View>
  );
}

function MenuScreen({
  menu,
  cartCount,
  offers,
  onAdd,
  refreshing,
  onRefresh,
}: {
  menu: MenuItem[];
  cartCount: number;
  offers: Offer[];
  onAdd: (item: MenuItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [category, setCategory] = useState('all');
  const categories = useMemo(() => ['all', ...Array.from(new Set(menu.map((item) => item.category)))], [menu]);
  const filtered = category === 'all' ? menu : menu.filter((item) => item.category === category);
  const heroOffer = offers.find((offer) => isOfferInDate(offer) && offer.imageUrl);

  return (
    <View style={styles.screen}>
      <View style={styles.heroPanel}>
        <View>
          <Text style={styles.kicker}>Premium dining, delivered</Text>
          <Text style={styles.screenTitle}>Menu</Text>
          <Text style={styles.screenSubtitle}>{cartCount ? `${cartCount} item${cartCount > 1 ? 's' : ''} in cart` : 'Choose your favorites'}</Text>
        </View>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="chef-hat" size={30} color="#120f0a" />
        </View>
      </View>
      {heroOffer ? (
        <View style={styles.offerHero}>
          <Image source={{ uri: heroOffer.imageUrl }} style={styles.offerHeroImage} />
          <View style={styles.offerHeroShade} />
          <View style={styles.offerHeroCopy}>
            <Text style={styles.offerHeroKicker}>Limited offer</Text>
            <Text style={styles.offerHeroTitle} numberOfLines={1}>{heroOffer.title}</Text>
            <Text style={styles.offerHeroText} numberOfLines={2}>{heroOffer.description || (heroOffer.code ? `Use ${heroOffer.code} at checkout` : 'Apply from cart')}</Text>
          </View>
          {heroOffer.code ? <Text style={styles.offerHeroCode}>{heroOffer.code}</Text> : null}
        </View>
      ) : null}
      <View style={styles.categoryRailOuter}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRail} contentContainerStyle={styles.categoryRailContent}>
          {categories.map((cat) => (
            <Pressable key={cat} style={[styles.categoryChip, category === cat && styles.categoryChipActive]} onPress={() => setCategory(cat)}>
              <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat === 'all' ? 'All' : cat}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#cda45e" />}
        ListEmptyComponent={<EmptyState title="No menu items" detail="Pull to refresh or try again in a moment." />}
        renderItem={({ item }) => (
          <View style={styles.menuCard}>
            <View style={styles.menuImageWrap}>
              <Image source={{ uri: item.image_url || item.img }} style={styles.menuImage} />
              <View style={styles.menuImageShade} />
              <View style={styles.categoryBadge}>
                <MaterialCommunityIcons name="star-four-points" size={12} color="#120f0a" />
                <Text style={styles.categoryBadgeText}>{item.category}</Text>
              </View>
            </View>
            <View style={styles.menuBody}>
              <Text style={styles.menuName}>{item.name}</Text>
              <Text style={styles.menuDescription} numberOfLines={2}>{item.description}</Text>
              <View style={styles.rowBetween}>
                <View>
                  <Text style={styles.menuPrice}>{price(item.price)}</Text>
                  <Text style={styles.menuMeta}>Freshly prepared</Text>
                </View>
                <Pressable style={styles.primaryButtonSmall} onPress={() => onAdd(item)}>
                  <MaterialCommunityIcons name="plus" size={18} color="#120f0a" />
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
  settings,
  offers,
  onQty,
  onCheckout,
  busy,
}: {
  cart: CartItem[];
  total: number;
  settings: BusinessSettings;
  offers: Offer[];
  onQty: (itemId: string, delta: number) => void;
  onCheckout: (type: OrderType, address: string, pincode: string, promoCode?: string | null) => Promise<void>;
  busy: boolean;
}) {
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [appliedOffer, setAppliedOffer] = useState<Offer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const insets = useSafeAreaInsets();
  const deliveryFee = orderType === 'delivery' && total < settings.freeDeliveryThreshold ? settings.deliveryFee : 0;
  const validOffers = offers.filter(isOfferInDate);
  const discount = offerDiscount(appliedOffer, total, cart);
  const grandTotal = Math.max(0, total + deliveryFee - discount);
  const typedOffer = validOffers.find((item) => item.code === promoCode.trim().toUpperCase());
  const typedOfferShortfall = typedOffer ? Math.max(0, typedOffer.minOrder - total) : 0;

  useEffect(() => {
    if (appliedOffer && (!isOfferInDate(appliedOffer) || total < appliedOffer.minOrder)) {
      setAppliedOffer(null);
    }
  }, [appliedOffer, total]);

  function applyOffer(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      Alert.alert('Offer', 'Enter a promo code.');
      return;
    }
    const offer = validOffers.find((item) => item.code === normalized);
    if (!offer) {
      Alert.alert('Offer', 'Promo code is not active.');
      return;
    }
    if (total < offer.minOrder) {
      Alert.alert('Offer', `This offer requires minimum order of ${price(offer.minOrder)}.`);
      return;
    }
    setAppliedOffer(offer);
    setPromoCode(offer.code);
  }

  function removeOffer() {
    setAppliedOffer(null);
    setPromoCode('');
  }

  async function submit() {
    if (total < settings.minOrderAmount) {
      Alert.alert('Checkout', `Minimum order amount is ${price(settings.minOrderAmount)}.`);
      return;
    }
    setSubmitting(true);
    try {
      await onCheckout(orderType, address, pincode, appliedOffer?.code || null);
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.formScrollContent, { paddingBottom: 118 + Math.max(insets.bottom, 12) }]}
      keyboardShouldPersistTaps="handled"
    >
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
            <Text style={styles.helpText}>Delivery only for 788001, 788002, 788003, 788004 and 788005. Free delivery from {price(settings.freeDeliveryThreshold)}.</Text>
          </>
        ) : null}

        {validOffers.length ? (
          <View style={styles.offerPanel}>
            <Text style={styles.panelTitle}>Offers</Text>
            {validOffers.slice(0, 2).map((offer) => (
              <Pressable key={offer.id} style={styles.mobileOfferCard} onPress={() => applyOffer(offer.code)}>
                {offer.imageUrl ? <Image source={{ uri: offer.imageUrl }} style={styles.mobileOfferThumb} /> : null}
                <View style={styles.mobileOfferCopy}>
                  <Text style={styles.mobileOfferTitle}>{offer.title}</Text>
                  <Text style={styles.mobileOfferMeta}>
                    {offer.code ? `Use ${offer.code}` : 'Apply at checkout'}
                    {offer.minOrder ? total < offer.minOrder ? ` • Add ${price(offer.minOrder - total)} more` : ` • Eligible` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
            <View style={styles.promoRow}>
              <TextInput style={[styles.input, styles.promoInput]} placeholder="Promo code" placeholderTextColor="#817767" autoCapitalize="characters" value={promoCode} onChangeText={(value) => setPromoCode(value.toUpperCase())} />
              <Pressable style={styles.promoButton} onPress={() => applyOffer(promoCode)}>
                <Text style={styles.primaryButtonText}>Apply</Text>
              </Pressable>
              {appliedOffer ? (
                <Pressable style={styles.promoRemoveButton} onPress={removeOffer}>
                  <MaterialCommunityIcons name="close" size={18} color="#cda45e" />
                </Pressable>
              ) : null}
            </View>
            {typedOffer && typedOfferShortfall > 0 ? (
              <Text style={styles.promoHint}>Add <Text style={styles.promoHintStrong}>{price(typedOfferShortfall)}</Text> more to apply {typedOffer.code}.</Text>
            ) : appliedOffer ? (
              <Text style={styles.promoHint}>Applied <Text style={styles.promoHintStrong}>{appliedOffer.code}</Text>.</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalValue}>{price(total)}</Text></View>
        {discount > 0 ? <View style={styles.totalRow}><Text style={styles.discountLabel}>Offer discount</Text><Text style={styles.discountValue}>-{price(discount)}</Text></View> : null}
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Delivery</Text><Text style={styles.totalValue}>{price(deliveryFee)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{price(grandTotal)}</Text></View>
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

function BookingScreen({ menu, onSubmit }: { menu: MenuItem[]; onSubmit: (form: ReservationForm, preorderItems: PreorderItem[]) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<'details' | 'preorder' | 'summary'>('details');
  const [form, setForm] = useState<ReservationForm>({
    name: '',
    phone: '',
    date: new Date().toISOString().slice(0, 10),
    time: '',
    guests: '4',
    specialRequests: '',
  });
  const [preorderItems, setPreorderItems] = useState<PreorderItem[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const preorderCount = preorderItems.reduce((sum, item) => sum + item.quantity, 0);
  const preorderTotal = preorderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function update<K extends keyof ReservationForm>(key: K, value: ReservationForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateReservation() {
    if (!form.name.trim() || normalizePhone(form.phone).length < 9 || !form.date || !form.time) {
      Alert.alert('Reservation', 'Please fill all required fields: name, phone, date and time.');
      return false;
    }
    if (form.date < new Date().toISOString().slice(0, 10)) {
      Alert.alert('Reservation', 'Reservation date cannot be in the past.');
      return false;
    }
    return true;
  }

  function switchReservationTab(nextTab: 'details' | 'preorder' | 'summary') {
    setTab(nextTab);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  }

  function goToPreorder() {
    if (!validateReservation()) return;
    switchReservationTab('preorder');
  }

  function goToSummary() {
    if (!validateReservation()) return;
    switchReservationTab('summary');
  }

  function addPreorderItem(item: MenuItem) {
    setPreorderItems((current) => {
      const found = current.find((entry) => entry.id === item.id);
      if (found) return current.map((entry) => entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry);
      return [...current, { id: item.id, name: item.name, price: Number(item.price || 0), quantity: 1 }];
    });
    setMenuVisible(false);
  }

  function updatePreorderQty(id: string, delta: number) {
    setPreorderItems((current) => current
      .map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  }

  function resetBooking() {
    setForm({
      name: '',
      phone: '',
      date: new Date().toISOString().slice(0, 10),
      time: '',
      guests: '4',
      specialRequests: '',
    });
    setPreorderItems([]);
    switchReservationTab('details');
  }

  async function submit() {
    if (!validateReservation()) return;
    setSubmitting(true);
    try {
      await onSubmit(form, preorderItems);
      if (!preorderItems.length) resetBooking();
    } catch (error) {
      Alert.alert('Booking failed', error instanceof Error ? error.message : 'Could not book table.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={[styles.formScrollContent, { paddingBottom: 118 + Math.max(insets.bottom, 12) }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.resHeading}>
        <Text style={styles.screenTitle}>Reserve Your Table</Text>
        <Text style={styles.screenSubtitle}>Secure your spot and pre-order signature dishes</Text>
      </View>
      <View style={styles.resPremium}>
        <View style={styles.resTabs}>
          {([
            ['details', 'calendar-month-outline', 'Table details'],
            ['preorder', 'silverware-fork-knife', 'Pre-order menu'],
            ['summary', 'clipboard-text-outline', 'Summary & Payment'],
          ] as ['details' | 'preorder' | 'summary', NavIconName, string][]).map(([key, icon, label]) => (
            <Pressable key={key} style={[styles.resTab, tab === key && styles.resTabActive]} onPress={() => key === 'preorder' ? goToPreorder() : key === 'summary' ? goToSummary() : switchReservationTab('details')}>
              <MaterialCommunityIcons name={icon} size={16} color={tab === key ? '#120f0a' : '#ddd'} />
              <Text style={[styles.resTabText, tab === key && styles.resTabTextActive]}>{label}</Text>
              {key === 'preorder' ? <View style={styles.preorderBadge}><Text style={styles.preorderBadgeText}>{preorderCount}</Text></View> : null}
            </Pressable>
          ))}
        </View>

        {tab === 'details' ? (
          <View style={styles.tabPane}>
            <Text style={styles.formLabel}><MaterialCommunityIcons name="account-outline" size={14} color="#cda45e" /> Full name *</Text>
            <TextInput style={styles.input} placeholder="John Doe" placeholderTextColor="#817767" value={form.name} onChangeText={(value) => update('name', value)} />
            <Text style={styles.formLabel}><MaterialCommunityIcons name="phone-outline" size={14} color="#cda45e" /> Phone number *</Text>
            <TextInput style={styles.input} placeholder="+91 98765 43210" placeholderTextColor="#817767" keyboardType="phone-pad" value={form.phone} onChangeText={(value) => update('phone', value)} />
            <View style={styles.inlineFields}>
              <View style={styles.inlineField}>
                <Text style={styles.formLabel}><MaterialCommunityIcons name="calendar-today" size={14} color="#cda45e" /> Date *</Text>
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor="#817767" value={form.date} onChangeText={(value) => update('date', value)} />
              </View>
              <View style={styles.inlineField}>
                <Text style={styles.formLabel}><MaterialCommunityIcons name="clock-outline" size={14} color="#cda45e" /> Time *</Text>
                <TextInput style={styles.input} placeholder="HH:mm" placeholderTextColor="#817767" value={form.time} onChangeText={(value) => update('time', value)} />
              </View>
            </View>
            <Text style={styles.formLabel}><MaterialCommunityIcons name="account-group-outline" size={14} color="#cda45e" /> Guests *</Text>
            <View style={styles.guestGrid}>
              {['1', '2', '3', '4', '5', '6', '7'].map((guest) => (
                <Pressable key={guest} style={[styles.guestChip, form.guests === guest && styles.guestChipActive]} onPress={() => update('guests', guest)}>
                  <Text style={[styles.guestChipText, form.guests === guest && styles.guestChipTextActive]}>{guest === '7' ? '7+' : guest}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.formLabel}><MaterialCommunityIcons name="comment-text-outline" size={14} color="#cda45e" /> Special requests</Text>
            <TextInput style={[styles.input, styles.textArea]} placeholder="e.g., vegan options, anniversary celebration..." placeholderTextColor="#817767" value={form.specialRequests} onChangeText={(value) => update('specialRequests', value)} multiline />
            <Pressable style={styles.resPrimaryAction} onPress={goToPreorder}>
              <Text style={styles.primaryButtonText}>Continue to pre-order</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#120f0a" />
            </Pressable>
          </View>
        ) : null}

        {tab === 'preorder' ? (
          <View style={styles.tabPane}>
            <View style={styles.preorderHeader}>
              <Text style={styles.preorderTitle}><MaterialCommunityIcons name="basket-outline" size={17} color="#cda45e" /> Your pre-order items</Text>
              <Pressable style={styles.outlineGoldButton} onPress={() => setMenuVisible(true)}>
                <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#cda45e" />
                <Text style={styles.outlineGoldText}>Browse full menu</Text>
              </Pressable>
            </View>
            {preorderItems.length ? preorderItems.map((item) => (
              <View key={item.id} style={styles.preorderItemCard}>
                <View style={styles.preorderItemInfo}>
                  <Text style={styles.preorderItemName}>{item.name}</Text>
                  <Text style={styles.preorderItemMeta}>{price(item.price)} each</Text>
                </View>
                <View style={styles.preorderControls}>
                  <View style={styles.preorderQty}>
                    <Pressable style={styles.preorderQtyButton} onPress={() => updatePreorderQty(item.id, -1)}><Text style={styles.preorderQtyButtonText}>-</Text></Pressable>
                    <Text style={styles.preorderQtyCount}>{item.quantity}</Text>
                    <Pressable style={styles.preorderQtyButton} onPress={() => updatePreorderQty(item.id, 1)}><Text style={styles.preorderQtyButtonText}>+</Text></Pressable>
                  </View>
                  <Pressable style={styles.removeItemButton} onPress={() => setPreorderItems((current) => current.filter((entry) => entry.id !== item.id))}>
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color="#fff" />
                    <Text style={styles.removeItemText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            )) : (
              <View style={styles.emptyPreorder}>
                <MaterialCommunityIcons name="pizza" size={34} color="#9d927d" />
                <Text style={styles.emptyDetail}>No items yet. Click "Browse full menu" to add delicious dishes.</Text>
              </View>
            )}
            <View style={styles.preorderSubtotalRow}>
              <Text style={styles.grandLabel}>Subtotal:</Text>
              <Text style={styles.grandValue}>{price(preorderTotal)}</Text>
            </View>
            <View style={styles.resFooterActions}>
              <Pressable style={styles.outlineGoldButtonLarge} onPress={() => switchReservationTab('details')}>
                <MaterialCommunityIcons name="chevron-left" size={16} color="#cda45e" />
                <Text style={styles.outlineGoldText}>Back</Text>
              </Pressable>
              <Pressable style={styles.resPrimaryActionCompact} onPress={goToSummary}>
                <Text style={styles.primaryButtonText}>Review & Payment</Text>
                <MaterialCommunityIcons name="chevron-right" size={17} color="#120f0a" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {tab === 'summary' ? (
          <View style={styles.tabPane}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}><MaterialCommunityIcons name="receipt-text-outline" size={17} color="#cda45e" /> Reservation details</Text>
              {[
                ['Name', form.name || '-'],
                ['Phone', form.phone || '-'],
                ['Date', form.date || '-'],
                ['Time', form.time || '-'],
                ['Guests', form.guests],
              ].map(([label, value]) => (
                <View key={label} style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>
              ))}
              {form.specialRequests ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Special requests</Text><Text style={styles.summaryValue}>{form.specialRequests}</Text></View> : null}
              <Text style={[styles.summaryTitle, styles.summaryPreorderTitle]}><MaterialCommunityIcons name="hamburger" size={17} color="#cda45e" /> Pre-ordered items</Text>
              {preorderItems.length ? preorderItems.map((item) => (
                <Text key={item.id} style={styles.summaryItem}>{item.name} x {item.quantity} = {price(item.price * item.quantity)}</Text>
              )) : <Text style={styles.emptyDetail}>No pre-ordered items.</Text>}
              <View style={[styles.summaryRow, styles.summaryTotalRow]}><Text style={styles.grandLabel}>Total Amount</Text><Text style={styles.grandValue}>{price(preorderTotal)}</Text></View>
            </View>
            <View style={styles.resFooterActions}>
              <Pressable style={styles.outlineGoldButtonLarge} onPress={() => switchReservationTab('preorder')}>
                <MaterialCommunityIcons name="pencil-outline" size={16} color="#cda45e" />
                <Text style={styles.outlineGoldText}>Edit order</Text>
              </Pressable>
              <Pressable style={[styles.resPrimaryActionCompact, submitting && styles.disabledButton]} disabled={submitting} onPress={submit}>
                {submitting ? <ActivityIndicator color="#120f0a" /> : (
                  <>
                    <MaterialCommunityIcons name="lock-outline" size={16} color="#120f0a" />
                    <Text style={styles.primaryButtonText}>{preorderTotal > 0 ? 'Confirm & Pay Now' : 'Confirm Reservation'}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <Modal visible={menuVisible} animationType="slide" transparent onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.menuPickerOverlay}>
          <View style={[styles.menuPickerCard, { paddingBottom: 16 + Math.max(insets.bottom, 12) }]}>
            <View style={styles.rowBetween}>
              <Text style={styles.menuPickerTitle}><MaterialCommunityIcons name="silverware-fork-knife" size={20} color="#cda45e" /> Our signature menu</Text>
              <Pressable onPress={() => setMenuVisible(false)}><Text style={styles.closeText}>Close</Text></Pressable>
            </View>
            <FlatList
              data={menu}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.menuPickerList}
              renderItem={({ item }) => (
                <Pressable style={styles.menuPickerItem} onPress={() => addPreorderItem(item)}>
                  <View style={styles.menuPickerInfo}>
                    <Text style={styles.preorderItemName}>{item.name}</Text>
                    <Text style={styles.preorderItemMeta} numberOfLines={2}>{item.description}</Text>
                    <Text style={styles.itemPrice}>{price(item.price)}</Text>
                  </View>
                  <View style={styles.addPreorderHint}>
                    <MaterialCommunityIcons name="plus-circle" size={16} color="#cda45e" />
                    <Text style={styles.outlineGoldText}>Add to pre-order</Text>
                  </View>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
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
  const insets = useSafeAreaInsets();

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.modalCard, { paddingBottom: 18 + Math.max(insets.bottom, 12) }]}>
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
        </ScrollView>
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

  const html = `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body style="background:#120f0a;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">
  <div><h3>Opening Razorpay...</h3><p>Please complete the payment securely.</p></div>
  <script>
    function send(type, payload) {
      var message = JSON.stringify({ type: type, payload: payload || {} });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(message);
      } else if (window.parent) {
        window.parent.postMessage(message, "*");
      }
    }
    var options = {
      key: "${payment?.razorpayKey || ''}",
      amount: ${payment?.amount || 0},
      currency: "INR",
      name: "Cheesy Crust Co.",
      description: "Order #${payment?.orderNumber || ''}",
      order_id: "${payment?.razorpayOrderId || ''}",
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

  useEffect(() => {
    if (!payment || Platform.OS !== 'web') return undefined;

    const listener = async (event: MessageEvent) => {
      const message = typeof event.data === 'string' ? safeJson(event.data) : event.data;
      if (!message?.type) return;

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
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onClose, onFailure, onSuccess, payment]);

  if (!payment) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.paymentShell}>
        <View style={styles.paymentHeader}>
          <Text style={styles.paymentTitle}>Secure Payment</Text>
          <Pressable onPress={onClose}><Text style={styles.closeText}>Cancel</Text></Pressable>
        </View>
        {verifying ? (
          <View style={styles.loadingShell}><ActivityIndicator color="#cda45e" size="large" /><Text style={styles.loadingText}>Verifying payment...</Text></View>
        ) : Platform.OS === 'web' ? (
          createElement('iframe', {
            srcDoc: html,
            title: 'Razorpay Checkout',
            style: { border: 0, flex: 1, width: '100%', height: '100%' },
            allow: 'payment *; clipboard-read *; clipboard-write *',
          } as any)
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
  shell: { flex: 1, backgroundColor: '#0d0b08' },
  loadingShell: { flex: 1, backgroundColor: '#0d0b08', alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#cda45e', fontSize: 15 },
  header: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#2f271b', backgroundColor: '#17120c' },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 12 },
  headerCopy: { flex: 1, marginLeft: 12 },
  logoMark: { backgroundColor: '#0d0b08', borderWidth: 1, borderColor: '#cda45e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#cda45e', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  logoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  brand: { color: '#fff0cc', fontSize: 23, fontWeight: '900', letterSpacing: 0 },
  subBrand: { color: '#b8ab91', marginTop: 3, fontSize: 12 },
  authPill: { backgroundColor: '#cda45e', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#cda45e', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  authPillText: { color: '#120f0a', fontWeight: '900' },
  content: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  formScrollContent: { flexGrow: 1 },
  heroPanel: { backgroundColor: '#1a150e', borderWidth: 1, borderColor: '#312717', borderRadius: 8, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOpacity: 0.26, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  heroIcon: { width: 54, height: 54, borderRadius: 8, backgroundColor: '#cda45e', alignItems: 'center', justifyContent: 'center' },
  offerHero: { height: 142, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#3a2f20', marginBottom: 14, backgroundColor: '#1a150e', justifyContent: 'flex-end' },
  offerHeroImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  offerHeroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.34)' },
  offerHeroCopy: { padding: 14, paddingRight: 92 },
  offerHeroKicker: { color: '#f3cf82', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  offerHeroTitle: { color: '#fff0cc', fontSize: 22, fontWeight: '900', marginTop: 2 },
  offerHeroText: { color: '#efe2c3', marginTop: 4, lineHeight: 19 },
  offerHeroCode: { position: 'absolute', top: 12, right: 12, backgroundColor: '#cda45e', color: '#120f0a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', fontWeight: '900' },
  kicker: { color: '#cda45e', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  screenTitle: { color: '#fff0cc', fontSize: 28, fontWeight: '900' },
  screenSubtitle: { color: '#b8ab91', marginTop: 4, marginBottom: 2 },
  categoryRailOuter: { height: 56, flexGrow: 0, marginBottom: 14, overflow: 'hidden' },
  categoryRail: { flex: 1 },
  categoryRailContent: { alignItems: 'center', paddingRight: 4 },
  categoryChip: { height: 40, paddingHorizontal: 17, borderRadius: 999, borderWidth: 1, borderColor: '#3a2f20', alignItems: 'center', justifyContent: 'center', marginRight: 9, backgroundColor: '#15110c' },
  categoryChipActive: { backgroundColor: '#cda45e', borderColor: '#cda45e' },
  categoryText: { color: '#cda45e', textTransform: 'capitalize', fontWeight: '700' },
  categoryTextActive: { color: '#120f0a' },
  menuCard: { backgroundColor: '#17130e', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#332817', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.32, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  menuImageWrap: { height: 178, width: '100%', backgroundColor: '#292217' },
  menuImage: { height: '100%', width: '100%' },
  menuImageShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.12)' },
  categoryBadge: { position: 'absolute', top: 12, left: 12, backgroundColor: '#cda45e', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 5 },
  categoryBadgeText: { color: '#120f0a', fontWeight: '900', textTransform: 'capitalize', fontSize: 12 },
  menuBody: { padding: 16 },
  menuName: { color: '#fff0cc', fontSize: 20, fontWeight: '900' },
  menuDescription: { color: '#a99b82', marginTop: 6, minHeight: 40, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuPrice: { color: '#d9b76c', fontSize: 22, fontWeight: '900' },
  menuMeta: { color: '#756b5b', fontSize: 12, marginTop: 2 },
  primaryButton: { backgroundColor: '#cda45e', minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 14 },
  primaryButtonSmall: { backgroundColor: '#cda45e', minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, flexDirection: 'row', gap: 5, shadowColor: '#cda45e', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
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
  offerPanel: { backgroundColor: 'rgba(205,164,94,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(205,164,94,0.24)', padding: 12, marginBottom: 12 },
  mobileOfferCard: { minHeight: 62, backgroundColor: '#11100d', borderRadius: 8, borderWidth: 1, borderColor: '#332817', marginBottom: 9, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  mobileOfferThumb: { width: 86, height: 62, backgroundColor: '#292217' },
  mobileOfferCopy: { flex: 1, paddingHorizontal: 10, paddingVertical: 8 },
  mobileOfferTitle: { color: '#fff0cc', fontWeight: '900' },
  mobileOfferMeta: { color: '#cda45e', marginTop: 4, fontSize: 12, fontWeight: '700' },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promoInput: { flex: 1, marginBottom: 0 },
  promoButton: { minHeight: 48, borderRadius: 8, backgroundColor: '#cda45e', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  promoRemoveButton: { width: 42, height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#cda45e', alignItems: 'center', justifyContent: 'center' },
  promoHint: { color: '#b8ab91', marginTop: 8, lineHeight: 18, fontSize: 12 },
  promoHintStrong: { color: '#cda45e', fontWeight: '900' },
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
  discountLabel: { color: '#79d98b', fontWeight: '800' },
  discountValue: { color: '#79d98b', fontWeight: '900' },
  grandLabel: { color: '#f6e6c6', fontSize: 18, fontWeight: '900' },
  grandValue: { color: '#cda45e', fontSize: 18, fontWeight: '900' },
  nav: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: '#302616', backgroundColor: '#17120c', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: -6 }, elevation: 10 },
  navButton: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  navButtonActive: { backgroundColor: '#cda45e' },
  navIconWrap: { minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  navBadge: { position: 'absolute', right: -11, top: -8, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#fff0cc', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  navBadgeText: { color: '#120f0a', fontSize: 10, fontWeight: '900' },
  navText: { color: '#9d927d', fontWeight: '900', fontSize: 11, marginTop: 3 },
  navTextActive: { color: '#120f0a' },
  resHeading: { alignItems: 'center', marginBottom: 14 },
  resPremium: { backgroundColor: '#0f0d0a', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(205,164,94,0.25)', padding: 14, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  resTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(205,164,94,0.3)' },
  resTab: { minHeight: 38, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'transparent' },
  resTabActive: { backgroundColor: '#cda45e', shadowColor: '#cda45e', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  resTabText: { color: '#ddd', fontWeight: '800', fontSize: 12 },
  resTabTextActive: { color: '#120f0a' },
  preorderBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#cda45e', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  preorderBadgeText: { color: '#120f0a', fontWeight: '900', fontSize: 11 },
  tabPane: { gap: 2 },
  formLabel: { color: '#cda45e', fontWeight: '800', fontSize: 13, marginBottom: 7, marginTop: 6 },
  inlineFields: { flexDirection: 'row', gap: 10 },
  inlineField: { flex: 1 },
  textArea: { minHeight: 78, textAlignVertical: 'top' },
  guestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  guestChip: { width: 42, height: 38, borderRadius: 999, borderWidth: 1, borderColor: '#3a2f20', alignItems: 'center', justifyContent: 'center', backgroundColor: '#15110c' },
  guestChipActive: { backgroundColor: '#cda45e', borderColor: '#cda45e' },
  guestChipText: { color: '#cda45e', fontWeight: '900' },
  guestChipTextActive: { color: '#120f0a' },
  resPrimaryAction: { alignSelf: 'flex-end', minHeight: 46, borderRadius: 999, paddingHorizontal: 16, marginTop: 12, backgroundColor: '#cda45e', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  resPrimaryActionCompact: { minHeight: 44, borderRadius: 999, paddingHorizontal: 14, backgroundColor: '#cda45e', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 1 },
  preorderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  preorderTitle: { color: '#cda45e', fontWeight: '900', fontSize: 16 },
  outlineGoldButton: { minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: '#cda45e', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  outlineGoldButtonLarge: { minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: '#cda45e', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  outlineGoldText: { color: '#cda45e', fontWeight: '800', fontSize: 12 },
  preorderItemCard: { backgroundColor: 'rgba(42,38,33,0.86)', borderRadius: 8, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#cda45e', gap: 10 },
  preorderItemInfo: { flex: 1 },
  preorderItemName: { color: '#f6e6c6', fontWeight: '900', fontSize: 15 },
  preorderItemMeta: { color: '#b0a89b', marginTop: 4, fontSize: 12, lineHeight: 17 },
  preorderControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  preorderQty: { minHeight: 38, borderRadius: 999, backgroundColor: '#1e1b17', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  preorderQtyButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#cda45e', alignItems: 'center', justifyContent: 'center' },
  preorderQtyButtonText: { color: '#120f0a', fontWeight: '900', fontSize: 16 },
  preorderQtyCount: { color: '#f6e6c6', minWidth: 24, textAlign: 'center', fontWeight: '900' },
  removeItemButton: { minHeight: 34, borderRadius: 999, backgroundColor: '#ab2e3f', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  removeItemText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  emptyPreorder: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 14 },
  preorderSubtotalRow: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#3a352e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resFooterActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 18 },
  summaryCard: { backgroundColor: '#1a1814', borderRadius: 8, padding: 16, marginBottom: 4, borderWidth: 1, borderColor: '#2c2418' },
  summaryTitle: { color: '#cda45e', fontWeight: '900', fontSize: 16, marginBottom: 12 },
  summaryPreorderTitle: { marginTop: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: '#3a352e', borderStyle: 'dashed', paddingBottom: 8, marginBottom: 9 },
  summaryLabel: { color: '#b8ab91', flex: 1 },
  summaryValue: { color: '#f6e6c6', fontWeight: '800', flex: 1, textAlign: 'right' },
  summaryItem: { color: '#f6e6c6', marginBottom: 8, lineHeight: 20 },
  summaryTotalRow: { borderBottomWidth: 0, marginTop: 8, marginBottom: 0 },
  menuPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end' },
  menuPickerCard: { maxHeight: '86%', backgroundColor: '#1a1814', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, borderWidth: 1, borderColor: '#cda45e' },
  menuPickerTitle: { color: '#cda45e', fontWeight: '900', fontSize: 19 },
  menuPickerList: { paddingTop: 12, paddingBottom: 10 },
  menuPickerItem: { backgroundColor: '#1f1c18', borderRadius: 8, borderWidth: 1, borderColor: '#2c2418', padding: 13, marginBottom: 10 },
  menuPickerInfo: { gap: 2 },
  itemPrice: { color: '#cda45e', fontWeight: '900', marginTop: 6 },
  addPreorderHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  orderCard: { backgroundColor: '#1a1814', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#2c2418', marginBottom: 12 },
  orderNumber: { color: '#f6e6c6', fontWeight: '900' },
  statusBadge: { color: '#120f0a', backgroundColor: '#cda45e', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', fontWeight: '900' },
  orderMeta: { color: '#9d927d', textTransform: 'capitalize', marginTop: 6 },
  orderTotal: { color: '#cda45e', fontSize: 18, fontWeight: '900', marginTop: 8 },
  profileName: { color: '#f6e6c6', fontSize: 22, fontWeight: '900' },
  profileLine: { color: '#9d927d', marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  modalScroll: { flex: 1 },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
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
