// src/components/FoodItemCard.js
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Swipeable } from 'react-native-gesture-handler';
import { format } from 'date-fns';
import { styles, borderColor, statusColor, formatRemaining } from './FoodItemCard.styles';
import { getApp } from '@react-native-firebase/app';
import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { parseISO } from '../utils/date';
import { toDisplayUri } from '../utils/media';

export default function FoodItemCard({
  item,
  daysRemaining,
  onPress,
  onDelete,
  // 🔸 parent now passes fresh, resolved values (no lookups here)
  categoryIcon,   // RN ImageSource | null
  categoryName,   // string | ''
}) {
  const exp = item?.expiryDate ? parseISO(item.expiryDate) : null;
  const safeName = typeof item?.name === 'string' ? item.name : 'Unnamed';

  // Use raw (saved) uri and rebase it for display every render
  const rawUri = item?.iconUri || item?.photoUri || '';
  const [displayUri, setDisplayUri] = useState(toDisplayUri(rawUri));
  const swipeRef = useRef(null);

  useEffect(() => {
    setDisplayUri(toDisplayUri(rawUri));
  }, [rawUri]);

  // ⭐ Rebase category icon too (in case parent passed a stale file:// container path)
  const normalizedCategoryIcon = useMemo(() => {
    if (categoryIcon && typeof categoryIcon === 'object' && 'uri' in categoryIcon && categoryIcon.uri) {
      return { uri: toDisplayUri(categoryIcon.uri) };
    }
    return categoryIcon || null;
  }, [categoryIcon]);

  const safeLog = async (name, params = {}) => {
    try {
      const ga = getAnalytics(getApp());
      await logEvent(ga, name, params);
    } catch {}
  };

  // Impression (once per mount)
  useEffect(() => {
    safeLog('item_card_impression', {
      item_id: item?.id ?? null,
      has_photo: rawUri ? 1 : 0,
      has_category: normalizedCategoryIcon || (categoryName && categoryName.trim()) ? 1 : 0,
      days_remaining: typeof daysRemaining === 'number' ? daysRemaining : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCardPress = async () => {
    await safeLog('item_card_click', {
      item_id: item?.id ?? null,
      has_photo: rawUri ? 1 : 0,
      days_remaining: typeof daysRemaining === 'number' ? daysRemaining : null,
    });
    onPress?.();
  };

  const handleDeletePress = async () => {
    await safeLog('item_card_delete_button', {
      item_id: item?.id ?? null,
      has_photo: rawUri ? 1 : 0,
      days_remaining: typeof daysRemaining === 'number' ? daysRemaining : null,
    });
    onDelete?.();
    swipeRef.current?.close?.();
  };

  const handleSwipeRightOpen = async () => {
    await safeLog('item_card_swipe_open', { item_id: item?.id ?? null, direction: 'right' });
  };
  const handleSwipeClose = async () => {
    await safeLog('item_card_swipe_close', { item_id: item?.id ?? null });
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={() => (
        <TouchableOpacity style={styles.swipeDeleteWrap} onPress={handleDeletePress} activeOpacity={0.8}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
        </TouchableOpacity>
      )}
      rightThreshold={36}
      overshootRight={false}
      onSwipeableRightOpen={handleSwipeRightOpen}
      onSwipeableClose={handleSwipeClose}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleCardPress}
        style={[styles.card, { borderColor: borderColor(daysRemaining) }]}
      >
        {/* Left column: EXP above image */}
        <View style={styles.leftCol}>
          <Text style={[styles.expInline, { color: statusColor(daysRemaining) }]}>
           {exp ? format(exp, 'yyyy-MM-dd') : '—'}
          </Text>
          <View style={styles.iconWrap}>
            {displayUri ? (
              <Image
                source={{ uri: displayUri }}
                style={styles.iconImg}
                onError={() => setDisplayUri(null)} // fallback if local file missing
              />
            ) : normalizedCategoryIcon ? (
              <Image source={normalizedCategoryIcon} style={styles.iconImg} />
            ) : (
              <Ionicons name="image-outline" size={44} color="#9ca3af" />
            )}
          </View>
        </View>

        {/* Middle column */}
        <View style={styles.middleCol}>
          <Text style={styles.name} numberOfLines={1}>{safeName}</Text>

          <View style={styles.remainRow}>
            {/* Left: duration */}
            <View style={styles.durationBox}>
              <Ionicons
                name={
                  typeof daysRemaining !== 'number'
                    ? 'help-circle-outline'
                    : daysRemaining < 0
                    ? 'alert-circle-outline'
                    : daysRemaining <= 7
                    ? 'time-outline'
                    : 'checkmark-circle-outline'
                }
                size={14}
                color="#6b7280"
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.remainText, { color: statusColor(daysRemaining) }]}
                numberOfLines={1}
              >
                {formatRemaining(daysRemaining)}
              </Text>
            </View>

            {/* Right: category (render exactly what parent resolved) */}
            <View style={styles.categoryBox}>
              {normalizedCategoryIcon ? (
                <Image source={normalizedCategoryIcon} style={styles.catIconSmall} resizeMode="cover" />
              ) : (
                <View style={styles.catIconSpacer} />
              )}
              {categoryName ? (
                <Text style={styles.catText} numberOfLines={1} ellipsizeMode="tail">
                  {categoryName}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}
