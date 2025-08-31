// src/i18n/langs.js

export const LANGS = [
  { code: 'system', label: 'System Default' },
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  // Add more languages here…
];

export const STRINGS = {
  en: {
    filter: 'Filter',
    clear: 'Clear',
    searchPlaceholder: 'Search items…',
    expiringInDays: 'Expiring in (days)',
    category: 'Category',
    reset: 'Reset',
    noResults: 'No results',
    noItemsYet: 'No items yet',
    tryDifferent: 'Try a different filter or search.',
    tapPlus: 'Tap “+” to add your first item.',
  },
  zh: {
    filter: '筛选',
    clear: '清除',
    searchPlaceholder: '搜索物品…',
    expiringInDays: '到期于（天内）',
    category: '类别',
    reset: '重置',
    noResults: '没有结果',
    noItemsYet: '还没有物品',
    tryDifferent: '试试不同的筛选或搜索。',
    tapPlus: '点击“+”添加你的第一个物品。',
  },
};
