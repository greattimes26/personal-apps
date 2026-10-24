// Hifz — language support (Arabic default, English). Display-only: stored data has no language.
import { surah, formatRange, rangeIdx, juzOfIndex } from '../../shared/quran.js';

const KEY = 'hifz:lang';
export let lang = (() => {
  try { return localStorage.getItem(KEY) || 'ar'; } catch { return 'ar'; }
})();
export const isAr = () => lang === 'ar';

export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  applyDocLang();
}

export function applyDocLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = isAr() ? 'rtl' : 'ltr';
  document.title = isAr() ? 'حفظ' : 'Hifz';
}

// Keeps Western-digit ranges like "1–25" in reading order inside Arabic text.
const iso = (s) => (isAr() ? `⁦${s}⁩` : s);

const STR = {
  en: {
    brandName: 'Hifz', brandSub: 'حفظ القرآن',
    'nav.day': 'Day', 'nav.plan': 'Plan', 'nav.history': 'History', 'nav.insights': 'Insights', 'nav.backup': 'Backup',
    lastExported: 'Last exported: {d}', never: 'never', exportBackup: 'Export backup',
    keysHint: '← → days · T today · N new · / search',

    today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday', inN: 'In {n}', nAgo: '{n} ago',
    memorization: 'Memorization', review: 'Review', memShort: 'Memorize', revShort: 'Review',
    'r4': 'Excellent', 'r3': 'Very Good', 'r2': 'Good', 'r1': 'Poor',
    'st.done': 'Done', 'st.today': 'To do', 'st.planned': 'Planned', 'st.missed': 'Not done',
    rating: 'Rating',

    add: '+ Add', edit: 'Edit', prevDay: 'Previous day', nextDay: 'Next day', goToDate: 'Go to date',
    emptyMemPlanned: 'No memorization planned for this day.', emptyMemLogged: 'No memorization logged for this day.',
    emptyRevPlanned: 'No review planned for this day.', emptyRevLogged: 'No review logged for this day.',
    plannedAhead: 'planned ahead',

    newSession: 'New session', editSession: 'Edit session', date: 'Date', range: 'Range', note: 'Note',
    notePh: 'Optional — mistakes, similar verses, how it felt…',
    del: 'Delete', cancel: 'Cancel', save: 'Save', addBtn: 'Add',
    confirmDelete: 'Delete this session?', sessionDeleted: 'Session deleted', sessionAdded: 'Session added', saved: 'Saved',
    futureHint: 'Future day — this is a plan. Rate it on the day.',
    rateHint: 'Leave empty if not done yet. Click again to clear.',

    from: 'From', to: 'To', ayah: 'ayah', fromSurah: 'From surah', toSurah: 'To surah', fromAyah: 'From ayah', toAyah: 'To ayah',
    wholeSurah: 'Whole surah', wholeJuz: 'Whole juz…', juzN: 'Juz {n}', juzRange: 'Juz {a}–{b}',
    errOrder: '“To” must come after “From”', errAyah: 'Check the ayah numbers',

    planSub: 'Optional. Plan any days you like — one day, a week, or the whole month.',
    prev30: 'Previous 30 days', next30: 'Next 30 days', planStart: 'Plan start date', fromToday: 'From today',
    autoPlan: 'Auto-plan…', clearPlans: 'Clear plans…',
    daysHave: '<b>{n}</b> of 30 days have something', toMemorize: '<b>{n}</b> to memorize', reaching: 'reaching <b>{x}</b>',
    reviewCount: 'Review: <b>{n}</b>', arrow: '→', colDay: 'Day', openDay: 'Open this day', addOn: 'Add {type} on {day}',

    autoTitle: 'Auto-plan', start: 'Start', days: 'Days', daysMax: 'days (max 30)', on: 'On',
    skip: 'Skip days that already have a session of this type', startAt: 'Start at', startSurah: 'Start surah', startAyah: 'Start ayah',
    perDay: 'Per day', ayahsUnit: 'ayahs', order: 'Order',
    forward: 'Forward — Al-Fatihah → An-Nas', backward: 'Backward by surah — An-Nas → Al-Baqarah',
    cycleOver: 'Cycle over', unitJuz: 'juz', unitSurah: 'surahs', unitAyahs: 'ayahs',
    reviewHint: 'Reviews rotate through the range and start over when they reach the end.',
    preview: 'Preview', nothingToAdd: 'Nothing to add with these settings.', addToPlan: 'Add to plan', addedN: 'Added {n}',

    clearTitle: 'Clear plans', clearSub: 'Removes sessions that are not rated yet. Rated sessions are never touched.',
    type: 'Type', bothTypes: 'Memorization and review', memOnly: 'Memorization only', revOnly: 'Review only',
    willRemove: '{n} not rated will be removed.', clear: 'Clear', removedN: 'Removed {n}',

    searchPh: 'Search: Al-Kahf · 2:255 · 18 · juz 30 · friday · poor · a note · البقرة', searchAria: 'Search history',
    all: 'All', notRated: 'Not rated', status: 'Status', anyStatus: 'Any status', fDone: 'Done', fPlanned: 'Planned / to do', fMissed: 'Not done (past)',
    dateRange: 'Date range', allDates: 'All dates', upToToday: 'Up to today', last7: 'Last 7 days', last30: 'Last 30 days', last90: 'Last 90 days',
    thisMonth: 'This month', upcoming: 'Upcoming', custom: 'Custom range…', fromDate: 'From date', toDate: 'To date', reset: 'Reset',
    histSum: '{s} on {d} · {a}',
    noSessions: 'No sessions yet. Start from the <a href="#day">Day</a> view or <a href="#plan">plan ahead</a>.',
    noMatch: 'No sessions match these filters.', showMore: 'Show more ({n} left)', jumpMonth: 'Jump to month',

    insSub: 'Based on rated sessions. A session’s rating applies to every ayah in its range; the latest rating counts.',
    insEmpty: 'Rate a few sessions and your insights will appear here.',
    kpiKnown: 'Ayahs known', kpiKnownSub: '{p}% of the Quran · ≈ {j} juz',
    kpiNew: 'Newly memorized', kpiNewSub: 'ayahs with a rated memorization session',
    kpiStreak: 'Streak', kpiStreakSub: 'longest {l} · {a} active days in the last 30',
    kpiMemQ: 'Memorization quality · 30 days', kpiRevQ: 'Review quality · 30 days',
    kpiPlan: 'Plan follow-through · 30 days', kpiPlanSub: '{d} done · {m} not done · {u} upcoming',
    trendNone: 'no earlier data to compare', trendSame: 'same as the 30 days before', trendVs: 'vs the 30 days before',
    quranMap: 'Quran map', bySurah: 'By surah', byJuz: 'By juz', notStarted: 'Not started',
    mapHint: 'Bar = share covered · click to see history',
    tileTip: '{name} — {p}% covered, avg {a} ({r})', tileStale: ', oldest part last seen {d}', tileNot: '{name} — not started',
    needsCare: 'Needs care', needsCareSub: 'latest rating Poor or Good', needsCareEmpty: 'Nothing rated Poor or Good right now.',
    strong: 'Strong spots', strongSub: 'latest rating Excellent', strongEmpty: 'No Excellent ratings yet.',
    due: 'Due for review', dueSub: 'known parts untouched 30+ days', dueEmpty: 'Everything you know was seen in the last 30 days.',
    daysWord: 'days', dueMeta: '{p}% known · avg {r}', moreN: '+ {n} more',
    activity: 'Activity', activitySub: 'last 26 weeks · darker = more ayahs', less: 'Less', more: 'More',
    hmTip: '{day} — {s}, {a}, avg {r}', nothingLogged: 'nothing logged',
    ratings: 'Ratings', ratingsSub: 'all rated sessions',
    byWeekday: 'By day of week', byWeekdaySub: 'sessions · avg rating', wdTip: '{w}: {s} on {d}, avg {a}',
    memPerMonth: 'Memorized per month', revPerMonth: 'Reviewed per month', inAyahs: 'ayahs', maxN: 'max {n}',

    backupSub: 'Your data stays on this Mac (in this browser’s storage). Export a file to back it up or move it to your iPhone.',
    exportTitle: 'Export', exportDesc: 'Saves {file} with all {n} (deletions included, so they sync too).',
    lastExportedB: 'Last exported:', exportTip: 'Tip: move the file to iCloud Drive to reach it from your iPhone.',
    importTitle: 'Import',
    importDesc: 'Merges a backup into this device. For each record the <b>newer</b> version wins, so an old backup never overwrites newer data here.',
    chooseFile: 'Choose backup file…', syncTitle: 'Syncing Mac ↔ iPhone',
    sync1: 'On the device with the newest changes: <b>Export</b> and save the file to iCloud Drive.',
    sync2: 'On the other device: <b>Import</b> that file. You’ll see what was added and updated.',
    sync3: 'To bring changes back, export there and import here. Importing in both directions is always safe.',
    exportedN: 'Exported {n} to {file}', importDone: 'Import finished', importFailed: 'Import failed.', nothingChanged: 'Nothing was changed.',
    backupFrom: '— backup from {d}', resAdded: 'added', resUpdated: 'updated (the backup had a newer version)', resUnchanged: 'unchanged',
    resKept: 'kept as-is (this device had a newer version)', resInvalid: 'skipped (unreadable)', migrated: 'Upgraded from schema version {n}.',
    storageOk: 'Storage is protected: Safari won’t clear it automatically.',
    storageNo: 'Storage isn’t marked as protected (Safari decides this). Using the app from the Dock and exporting regularly keeps your data safe.',
    storageUnknown: 'This browser doesn’t report storage protection. Export regularly to keep your data safe.',
    'err.not-json': 'This file is not valid JSON.', 'err.not-backup': 'This file is not a backup (no items list).',
    'err.wrong-app': 'This backup belongs to a different app.', 'err.newer-version': 'This backup was made by a newer version of the app. Update the app first, then import.',
  },
  ar: {
    brandName: 'حِفظ', brandSub: 'خطة الحفظ والمراجعة',
    'nav.day': 'اليوم', 'nav.plan': 'الخطة', 'nav.history': 'السجل', 'nav.insights': 'الإحصاءات', 'nav.backup': 'النسخ الاحتياطي',
    lastExported: 'آخر تصدير: {d}', never: 'لم يتم بعد', exportBackup: 'تصدير نسخة احتياطية',
    keysHint: '← → الأيام · T اليوم · N جديد · / بحث',

    today: 'اليوم', tomorrow: 'غداً', yesterday: 'أمس', inN: 'بعد {n}', nAgo: 'قبل {n}',
    memorization: 'الحفظ', review: 'المراجعة', memShort: 'حفظ', revShort: 'مراجعة',
    'r4': 'ممتاز', 'r3': 'جيد جداً', 'r2': 'جيد', 'r1': 'ضعيف',
    'st.done': 'تم', 'st.today': 'للإنجاز', 'st.planned': 'مخطط', 'st.missed': 'لم يتم',
    rating: 'التقييم',

    add: '+ إضافة', edit: 'تعديل', prevDay: 'اليوم السابق', nextDay: 'اليوم التالي', goToDate: 'الانتقال إلى تاريخ',
    emptyMemPlanned: 'لا يوجد حفظ مخطط لهذا اليوم.', emptyMemLogged: 'لم يُسجَّل حفظ لهذا اليوم.',
    emptyRevPlanned: 'لا توجد مراجعة مخططة لهذا اليوم.', emptyRevLogged: 'لم تُسجَّل مراجعة لهذا اليوم.',
    plannedAhead: 'مخطط مسبقاً',

    newSession: 'جلسة جديدة', editSession: 'تعديل الجلسة', date: 'التاريخ', range: 'المقطع', note: 'ملاحظة',
    notePh: 'اختياري — أخطاء، متشابهات، انطباعك…',
    del: 'حذف', cancel: 'إلغاء', save: 'حفظ التعديلات', addBtn: 'إضافة',
    confirmDelete: 'حذف هذه الجلسة؟', sessionDeleted: 'تم حذف الجلسة', sessionAdded: 'تمت إضافة الجلسة', saved: 'تم الحفظ',
    futureHint: 'يوم قادم — هذه خطة. قيّمها في يومها.',
    rateHint: 'اتركه فارغاً إن لم يتم بعد. اضغط مرة أخرى للإلغاء.',

    from: 'من', to: 'إلى', ayah: 'آية', fromSurah: 'سورة البداية', toSurah: 'سورة النهاية', fromAyah: 'آية البداية', toAyah: 'آية النهاية',
    wholeSurah: 'السورة كاملة', wholeJuz: 'جزء كامل…', juzN: 'الجزء {n}', juzRange: 'الأجزاء {a}–{b}',
    errOrder: 'يجب أن تكون «إلى» بعد «من»', errAyah: 'تحقق من أرقام الآيات',

    planSub: 'اختيارية. خطط لما تشاء من الأيام — يوماً، أو أسبوعاً، أو شهراً كاملاً.',
    prev30: 'الثلاثون يوماً السابقة', next30: 'الثلاثون يوماً التالية', planStart: 'تاريخ بداية الخطة', fromToday: 'من اليوم',
    autoPlan: 'تخطيط تلقائي…', clearPlans: 'مسح الخطط…',
    daysHave: '<b>{n}</b> من 30 يوماً فيها جلسات', toMemorize: '<b>{n}</b> للحفظ', reaching: 'حتى <b>{x}</b>',
    reviewCount: 'المراجعة: <b>{n}</b>', arrow: '←', colDay: 'اليوم', openDay: 'فتح هذا اليوم', addOn: 'إضافة {type} يوم {day}',

    autoTitle: 'تخطيط تلقائي', start: 'البداية', days: 'المدة', daysMax: 'يوماً (حتى 30)', on: 'الأيام',
    skip: 'تخطَّ الأيام التي فيها جلسة من هذا النوع', startAt: 'ابدأ من', startSurah: 'سورة البداية', startAyah: 'آية البداية',
    perDay: 'يومياً', ayahsUnit: 'آيات', order: 'الترتيب',
    forward: 'تصاعدي — من الفاتحة إلى الناس', backward: 'تنازلي بالسور — من الناس إلى البقرة',
    cycleOver: 'المقطع', unitJuz: 'أجزاء', unitSurah: 'سور', unitAyahs: 'آيات',
    reviewHint: 'تدور المراجعة على المقطع وتبدأ من جديد عند نهايته.',
    preview: 'معاينة', nothingToAdd: 'لا شيء للإضافة بهذه الإعدادات.', addToPlan: 'أضف إلى الخطة', addedN: 'تمت إضافة {n}',

    clearTitle: 'مسح الخطط', clearSub: 'يحذف الجلسات غير المقيّمة فقط. الجلسات المقيّمة لا تُمس.',
    type: 'النوع', bothTypes: 'الحفظ والمراجعة', memOnly: 'الحفظ فقط', revOnly: 'المراجعة فقط',
    willRemove: 'سيتم حذف {n} غير مقيّمة.', clear: 'مسح', removedN: 'تم حذف {n}',

    searchPh: 'ابحث: الكهف · 2:255 · 18 · جزء 30 · الجمعة · ضعيف · ملاحظة', searchAria: 'البحث في السجل',
    all: 'الكل', notRated: 'بدون تقييم', status: 'الحالة', anyStatus: 'كل الحالات', fDone: 'تم', fPlanned: 'مخطط / للإنجاز', fMissed: 'لم يتم (سابقاً)',
    dateRange: 'الفترة', allDates: 'كل التواريخ', upToToday: 'حتى اليوم', last7: 'آخر 7 أيام', last30: 'آخر 30 يوماً', last90: 'آخر 90 يوماً',
    thisMonth: 'هذا الشهر', upcoming: 'القادم', custom: 'فترة مخصصة…', fromDate: 'من تاريخ', toDate: 'إلى تاريخ', reset: 'إعادة ضبط',
    histSum: '{s} في {d} · {a}',
    noSessions: 'لا توجد جلسات بعد. ابدأ من صفحة <a href="#day">اليوم</a> أو <a href="#plan">خطط مسبقاً</a>.',
    noMatch: 'لا توجد جلسات تطابق هذه الفلاتر.', showMore: 'عرض المزيد (متبقٍ {n})', jumpMonth: 'الانتقال إلى شهر',

    insSub: 'مبنية على الجلسات المقيّمة. يُطبَّق تقييم الجلسة على كل آيات مقطعها، ويُعتمد آخر تقييم.',
    insEmpty: 'قيّم بعض الجلسات لتظهر إحصاءاتك هنا.',
    kpiKnown: 'الآيات المحفوظة', kpiKnownSub: '{p}% من القرآن · ≈ {j} جزء',
    kpiNew: 'حفظ جديد', kpiNewSub: 'آيات لها جلسة حفظ مقيّمة',
    kpiStreak: 'أيام متتالية', kpiStreakSub: 'الأطول {l} · نشاط {a} من آخر 30 يوماً',
    kpiMemQ: 'جودة الحفظ · 30 يوماً', kpiRevQ: 'جودة المراجعة · 30 يوماً',
    kpiPlan: 'الالتزام بالخطة · 30 يوماً', kpiPlanSub: 'تم {d} · لم يتم {m} · قادم {u}',
    trendNone: 'لا توجد بيانات سابقة للمقارنة', trendSame: 'مثل الثلاثين يوماً السابقة', trendVs: 'مقارنة بالثلاثين يوماً السابقة',
    quranMap: 'خريطة القرآن', bySurah: 'بالسور', byJuz: 'بالأجزاء', notStarted: 'لم يبدأ',
    mapHint: 'الشريط = نسبة المحفوظ · اضغط لعرض السجل',
    tileTip: '{name} — محفوظ {p}%، المتوسط {a} ({r})', tileStale: '، أقدم جزء رُوجع {d}', tileNot: '{name} — لم يبدأ',
    needsCare: 'تحتاج عناية', needsCareSub: 'آخر تقييم ضعيف أو جيد', needsCareEmpty: 'لا يوجد ما تقييمه ضعيف أو جيد حالياً.',
    strong: 'مواضع القوة', strongSub: 'آخر تقييم ممتاز', strongEmpty: 'لا توجد تقييمات ممتازة بعد.',
    due: 'تحتاج مراجعة', dueSub: 'محفوظ لم يُراجع منذ 30 يوماً أو أكثر', dueEmpty: 'كل محفوظك رُوجع خلال آخر 30 يوماً.',
    daysWord: 'يوماً', dueMeta: 'محفوظ {p}% · المتوسط {r}', moreN: '+ {n} أخرى',
    activity: 'النشاط', activitySub: 'آخر 26 أسبوعاً · الأغمق = آيات أكثر', less: 'أقل', more: 'أكثر',
    hmTip: '{day} — {s}، {a}، المتوسط {r}', nothingLogged: 'لا شيء مسجل',
    ratings: 'التقييمات', ratingsSub: 'كل الجلسات المقيّمة',
    byWeekday: 'حسب أيام الأسبوع', byWeekdaySub: 'الجلسات · متوسط التقييم', wdTip: '{w}: {s} في {d}، المتوسط {a}',
    memPerMonth: 'الحفظ شهرياً', revPerMonth: 'المراجعة شهرياً', inAyahs: 'بالآيات', maxN: 'الأعلى {n}',

    backupSub: 'بياناتك محفوظة على هذا الماك (في تخزين المتصفح). صدّر ملفاً لحفظ نسخة احتياطية أو لنقلها إلى الآيفون.',
    exportTitle: 'التصدير', exportDesc: 'يحفظ {file} بكل البيانات ({n})، بما فيها المحذوفات لتُزامَن أيضاً.',
    lastExportedB: 'آخر تصدير:', exportTip: 'نصيحة: انقل الملف إلى iCloud Drive لتصل إليه من الآيفون.',
    importTitle: 'الاستيراد',
    importDesc: 'يدمج النسخة الاحتياطية مع بيانات هذا الجهاز. لكل سجل تُعتمد النسخة <b>الأحدث</b>، فلا تطغى نسخة قديمة على بيانات أحدث هنا.',
    chooseFile: 'اختر ملف النسخة…', syncTitle: 'المزامنة بين الماك والآيفون',
    sync1: 'على الجهاز الذي فيه أحدث التغييرات: <b>صدّر</b> واحفظ الملف في iCloud Drive.',
    sync2: 'على الجهاز الآخر: <b>استورد</b> الملف. سترى ما أُضيف وما حُدّث.',
    sync3: 'لنقل التغييرات بالعكس، صدّر هناك واستورد هنا. الاستيراد في الاتجاهين آمن دائماً.',
    exportedN: 'تم تصدير {n} إلى {file}', importDone: 'اكتمل الاستيراد', importFailed: 'فشل الاستيراد.', nothingChanged: 'لم يتغير شيء.',
    backupFrom: '— نسخة بتاريخ {d}', resAdded: 'أُضيفت', resUpdated: 'حُدّثت (النسخة الاحتياطية أحدث)', resUnchanged: 'دون تغيير',
    resKept: 'أُبقيت كما هي (نسخة هذا الجهاز أحدث)', resInvalid: 'تم تخطيها (غير مقروءة)', migrated: 'تمت الترقية من إصدار البيانات {n}.',
    storageOk: 'التخزين محمي: لن يحذفه Safari تلقائياً.',
    storageNo: 'التخزين غير محمي (Safari هو من يقرر ذلك). استخدام التطبيق من الـ Dock والتصدير بانتظام يحفظان بياناتك.',
    storageUnknown: 'هذا المتصفح لا يوضح حالة حماية التخزين. صدّر بانتظام لتبقى بياناتك آمنة.',
    'err.not-json': 'هذا الملف ليس بصيغة JSON صحيحة.', 'err.not-backup': 'هذا الملف ليس نسخة احتياطية.',
    'err.wrong-app': 'هذه النسخة الاحتياطية لتطبيق آخر.', 'err.newer-version': 'هذه النسخة من إصدار أحدث للتطبيق. حدّث التطبيق أولاً ثم استورد.',
  },
};

export function t(key, params = {}) {
  const s = STR[lang][key] ?? STR.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

// ---------- counts ----------

// Arabic forms: [one, two, 3–10, 11+]
const AR_FORMS = {
  ayah: ['آية واحدة', 'آيتين', 'آيات', 'آية'],
  session: ['جلسة واحدة', 'جلستين', 'جلسات', 'جلسة'],
  day: ['يوم واحد', 'يومين', 'أيام', 'يوماً'],
  record: ['سجل واحد', 'سجلين', 'سجلات', 'سجلاً'],
};
const AR_ZERO = { ayah: 'آية', session: 'جلسة', day: 'يوم', record: 'سجل' };
const EN_FORMS = { ayah: ['ayah', 'ayahs'], session: ['session', 'sessions'], day: ['day', 'days'], record: ['record', 'records'] };

/** "5 ayahs" / "5 آيات", "آيتين", "25 آية". */
export function count(n, noun) {
  const num = n.toLocaleString('en-US');
  if (!isAr()) return `${num} ${EN_FORMS[noun][n === 1 ? 0 : 1]}`;
  const f = AR_FORMS[noun];
  if (n === 1) return f[0];
  if (n === 2) return f[1];
  if (n === 0) return `0 ${AR_ZERO[noun]}`;
  const r = n % 100;
  return `${num} ${r >= 3 && r <= 10 ? f[2] : f[3]}`;
}

// ---------- labels ----------

export const ratingLabel = (v) => t(`r${v}`);
export const ratingName = (avg) => (avg == null ? '—' : ratingLabel(Math.round(avg)));
export const typeLabel = (type) => t(type === 'memorize' ? 'memorization' : 'review');
export const typeShort = (type) => t(type === 'memorize' ? 'memShort' : 'revShort');
export const statusLabel = (s) => t(`st.${s}`);
export const surahName = (n) => (isAr() ? surah(n).ar : surah(n).name);

export function rangeLabel(from, to) {
  if (!isAr()) return formatRange(from, to);
  const A = surah(from.s), B = surah(to.s);
  if (from.s === to.s) {
    if (from.a === 1 && to.a === A.ayahs) return A.ar;
    return from.a === to.a ? `${A.ar} ${from.a}` : `${A.ar} ${iso(`${from.a}–${to.a}`)}`;
  }
  if (from.a === 1 && to.a === B.ayahs) return `${A.ar} – ${B.ar}`;
  return `${A.ar} ${from.a} – ${B.ar} ${to.a}`;
}

export function juzLabel(from, to) {
  const [x, y] = rangeIdx(from, to);
  const a = juzOfIndex(x), b = juzOfIndex(y);
  return a === b ? t('juzN', { n: a }) : iso(t('juzRange', { a, b }));
}

export function surahOption(s) {
  return isAr() ? `${s.n}. ${s.ar} (${s.ayahs})` : `${s.n}. ${s.name} — ${s.ar} (${s.ayahs})`;
}

// ---------- dates ----------

const loc = () => (isAr() ? 'ar-u-ca-gregory-nu-latn' : 'en-GB');
const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export const weekdayName = (s) => pd(s).toLocaleDateString(loc(), { weekday: 'long' });
export const weekdayShort = (s) => pd(s).toLocaleDateString(loc(), { weekday: isAr() ? 'long' : 'short' });
/** Weekday name by index, 0 = Sunday. */
export const weekdayByIndex = (k, short = false) => (short ? weekdayShort : weekdayName)(`2026-10-${25 + k}`);

export const fmtDate = (s, { year = true } = {}) =>
  pd(s).toLocaleDateString(loc(), { day: 'numeric', month: isAr() ? 'long' : 'short', ...(year ? { year: 'numeric' } : {}) });
export const fmtLongDate = (s) => pd(s).toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtMonth = (ym) => pd(`${ym}-01`).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
export const fmtMonthShort = (ym) => pd(`${ym}-01`).toLocaleDateString(loc(), { month: isAr() ? 'long' : 'short' });
export const fmtMonthTiny = (ym) => (isAr() ? String(Number(ym.slice(5, 7))) : pd(`${ym}-01`).toLocaleDateString('en-GB', { month: 'narrow' }));
export const fmtDateTime = (iso8601) => new Date(iso8601).toLocaleString(loc(), { dateStyle: 'medium', timeStyle: 'short' });

export function hijri(s) {
  try {
    return pd(s).toLocaleDateString(isAr() ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

// ---------- search vocabulary ----------

export const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const AR_RATINGS = { 'ممتاز': 4, 'جيد': 2, 'ضعيف': 1 };
