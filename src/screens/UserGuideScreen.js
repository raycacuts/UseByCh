// src/screens/UserGuide.js
import React from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, Linking, Platform } from 'react-native';

export default function UserGuide() {
  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar: same size/style as Home, no side spacers */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>使用指南</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.h1}>保质通 — 使用指南</Text>
        <Text style={styles.p}>
          保质通帮你追踪带有到期日期的物品。你可以拍摄标签自动填写，或手动添加/编辑项目。
        </Text>

        <Text style={styles.h2}>快速上手</Text>
        <View style={styles.list}>
          <Bullet>在首页点击 <Text style={styles.bold}>添加项目</Text>。</Bullet>
          {/* <Bullet>选择 <Text style={styles.bold}>扫描</Text>（拍照）或手动输入信息。</Bullet> */}
          <Bullet>我们会建议 <Text style={styles.bold}>名称</Text> 和 <Text style={styles.bold}>日期</Text>；你可随时修改。</Bullet>
          <Bullet>保存。临近/已过期项目会高亮显示；提醒会在你设定的时间触发。</Bullet>
        </View>

        <Text style={styles.h2}>首页</Text>
        <View style={styles.list}>
          <Bullet>
            项目按到期日排序并按天分组。细分割线只会出现在<Text style={styles.bold}>不同日期之间</Text>。
          </Bullet>
          <Bullet>
            顶部：<Text style={styles.bold}>筛选</Text> • <Text style={styles.bold}>清除</Text>（删除当前显示的项目）• <Text style={styles.bold}>搜索</Text>。
          </Bullet>
          <Bullet>
            卡片在存在分类时会显示分类。若项目<Text style={styles.bold}>没有分类</Text>，分类区域会隐藏（不会显示“无分类”字样）。
          </Bullet>
        </View>

        <Text style={styles.h2}>筛选抽屉</Text>
        <View style={styles.list}>
          <Bullet>
            顶部的<Text style={styles.bold}>计数</Text>展示当前首页视图下的<Text style={styles.bold}>已过期</Text>与<Text style={styles.bold}>总计</Text>（随筛选实时更新）。
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>即将到期（天）</Text>：仅显示在 N 天内到期的项目。
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>分类</Text>：可多选内置和自定义分类；也可选择“无分类”。
          </Bullet>
          <Bullet><Text style={styles.bold}>重置</Text> 会清除全部筛选条件。</Bullet>
        </View>

        <Text style={styles.h2}>分类</Text>
        <View style={styles.list}>
          <Bullet>
            在 <Text style={styles.bold}>设置 → 分类</Text> 中可新增、删除、重排分类并选择自定义图标。
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>删除分类</Text> 后，使用该分类的所有项目会立即更新为<Text style={styles.bold}>无分类</Text>（首页与日历都会同步）。
          </Bullet>
        </View>

        <Text style={styles.h2}>导入 / 导出</Text>
        <View style={styles.list}>
          <Bullet>
            <Text style={styles.bold}>导出（.zip）</Text> 包含 <Text style={styles.mono}>manifest.json</Text> + 图片。每个项目的
            <Text style={styles.bold}>分类以分类名称</Text> 保存（不包含内部 ID）。
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>导入（.zip）</Text> 会先按<Text style={styles.bold}>分类名称</Text>创建缺失的分类，然后按名称为项目分配分类（内置分类按 key/label 映射）。
          </Bullet>
          <Bullet>导入结束后会自动清理临时文件。</Bullet>
        </View>

        <Text style={styles.h2}>日历</Text>
        <View style={styles.list}>
          <Bullet>
            月视图：左右滑动切换，或点击标题选择月/年。“今天”按钮跳转到本月。
          </Bullet>
          <Bullet>
            有项目的日期会被轻微标记；点击某一天可查看当天列表。顶部样式与首页一致。
          </Bullet>
        </View>

        {/* <Text style={styles.h2}>扫描与自动填写</Text>
        <View style={styles.list}>
          <Bullet>请拍摄清晰、光线充足的日期区域照片。</Bullet>
          <Bullet>需要网络（OCR + LLM）。你也可在离线时手动录入/编辑。</Bullet>
          <Bullet>请务必核对建议日期——标签格式多样，OCR 可能漏识别。</Bullet>
        </View> */}

        <Text style={styles.h2}>提醒与设置</Text>
        <View style={styles.list}>
          <Bullet>
            <Text style={styles.bold}>通知</Text> 时间：<Text style={styles.bold}>设置 → 提醒时间</Text>（每天在你选择的整点推送）。
          </Bullet>
          {/* <Bullet>
            <Text style={styles.bold}>更多扫描</Text>：观看可选激励视频可获<Text style={styles.bold}>+5</Text>；若无库存，可领取<Text style={styles.bold}>每日 +1</Text>。
          </Bullet> */}
        </View>

        {/* <Text style={styles.h2}>限额与广告</Text>
        <View style={styles.list}>
          <Bullet><Text style={styles.bold}>每月 50 次扫描</Text>免费。</Bullet>
          <Bullet>首页有小横幅广告；本版本无插屏广告和订阅。</Bullet>
        </View> */}

        <Text style={styles.h2}>隐私</Text>
        <View style={styles.list}>
          <Bullet>你的项目与备注仅存储在本机。</Bullet>
          {/* <Bullet>扫描照片仅用于提取文字，服务不会保留你的图片。</Bullet> */}
          {/* <Bullet>广告合作方可能使用设备标识做投放；你可在系统设置中重置/限制。</Bullet> */}
        </View>

        <Text style={styles.h2}>故障排查</Text>
        <View style={styles.list}>
          {/* <Bullet><Text style={styles.bold}>扫描失败</Text>：检查网络后重试。</Bullet> */}
          <Bullet><Text style={styles.bold}>未识别到日期</Text>：对准日期区域重新拍摄，或手动输入。</Bullet>
          <Bullet><Text style={styles.bold}>激励广告不可用</Text>：稍后重试（库存会波动）。</Bullet>
          <Bullet><Text style={styles.bold}>未收到通知</Text>：在系统设置中开启应用通知。</Bullet>
        </View>

        <Text style={styles.h2}>联系</Text>
        <Text style={styles.p}>
          有问题或建议？欢迎发送邮件至{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('mailto:ruiruicactus@hotmail.com?subject=UseBy%20Feedback')}
          >
            ruiruicactus@hotmail.com
          </Text>
          。
        </Text>

        <Text style={styles.footer}>© {new Date().getFullYear()} 保质通</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Bullet({ children }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bullet}>{'\u2022'}</Text>
      <Text style={styles.li}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // Top bar (Home style)
  topBar: {
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },

  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },

  h1: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  h2: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 16, marginBottom: 6 },
  p: { fontSize: 14, color: '#374151', lineHeight: 20 },
  list: { marginTop: 4 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  bullet: { fontSize: 16, color: '#6b7280', lineHeight: 20 },
  li: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  bold: { fontWeight: '700' },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), color: '#111827' },
  link: { color: '#2563eb', textDecorationLine: 'underline' },
  footer: { textAlign: 'center', color: '#9ca3af', marginTop: 24, fontSize: 12 },
});
