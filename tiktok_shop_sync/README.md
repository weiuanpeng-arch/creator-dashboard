# TikTok Shop Sync

这套目录用于承接四个店铺的达人后台数据，并把数据同步回现有核心达人看板。

## 目标

- 四个店铺数据混合在一起管理，`店铺` 仅保留为筛选标签。
- 原始来源先使用：
  - `Affiliate Center -> Analytics -> Performance -> Videos`
  - `Affiliate Center -> Creator Analysis`
- 两张来源表通过 `creator` 进行统一映射。
- 保留后续两类补数入口：
  - API 导入
  - 手工表格上传

## 目录

- `build_sync_workbook.py`
  - 从现有的 [达人多次合作监控看板_填充版.xlsx](/Users/apple/Desktop/达人多次合作监控看板_填充版.xlsx) 生成同步版工作簿。
- `merge_manual_exports.py`
  - 把手工导出的 Videos / Creator Excel 统一清洗为标准 CSV 明细。
- `sync_schema.py`
  - 同步版工作簿和标准明细的字段定义。

## 工作簿结构

输出文件：
[达人多次合作监控看板_同步版.xlsx](/Users/apple/Desktop/达人多次合作监控看板_同步版.xlsx)

新增 sheet：

- `原始视频表现`
- `原始达人表现`
- `Creator映射`
- `统一达人事实表`
- `API导入预留`
- `表格上传导入`
- `同步日志`
- `同步说明`

原有 sheet 保留：

- `达人总览`
- `L0_L1重点达人池`
- `合作记录明细`
- `运营驾驶舱`

## 当前统一主键建议

1. 优先：达人主页标识
2. 次优：标准化后的 `creator name`
3. 再映射回现有达人库的 `达人ID / kolId`

## 当前同步口径

- 首次初始化：手工导入过去 `3` 个月历史包
- 日常增量：从基线结束次日开始，按天递增
- 同步节奏：每天 `15:30`

## 历史导入示例

```bash
python3 /Users/apple/Documents/Playground/tiktok_shop_sync/bootstrap_manual_history.py \
  --store "Letme Home Living" \
  --stat-date "2026-03-25" \
  --range-label "过去3个月" \
  --video-file "/Users/apple/Desktop/Transaction_Analysis_Video_List_20251224-20260123.xlsx" \
  --creator-file "/Users/apple/Desktop/Transaction_Analysis_Creator_List_20251224-20260123.xlsx"
```

说明：

- 如果某个文件为空或未导出成功，脚本会跳过该部分。
- 历史导入完成后，该店铺会被标记为 `initialized=true`，并自动写入下一次增量日期。
- 例如基线截止 `2026-03-24`，后续日更会从 `2026-03-25` 开始。
- 规范化结果会写入：
  - `/Users/apple/Documents/Playground/tiktok_shop_sync/data/normalized/video_performance.csv`
  - `/Users/apple/Documents/Playground/tiktok_shop_sync/data/normalized/creator_performance.csv`

## 日更示例

```bash
python3 /Users/apple/Documents/Playground/tiktok_shop_sync/run_sync_pipeline.py --mode auto
```

说明：

- 未做历史导入的店铺会被跳过，并提示先导入历史包。
- 已完成历史导入的店铺会自动按 `next_increment_date` 每次推进 1 天。
- 默认只会拉取到“昨天”为止，避免当天数据还没完全结算就被误抓。

## 线上数据库主链（Supabase REST）

当前推荐方向是：

- 本地只负责：
  - 拉取导出
  - 清洗标准化
  - 上传到线上数据库
  - 上传成功后再删除本地临时导出
- 线上数据库负责：
  - 保存 `Creator / Videos / Cooperation / SKU` 原始数据
  - 后续承接唯一达人事实层
  - 逐步成为页面和工作簿的长期真源

### 第一步：先在 Supabase SQL Editor 建表

先执行：

- [supabase_tiktok_raw_setup.sql](/Users/apple/Documents/Playground/tiktok_shop_sync/supabase_tiktok_raw_setup.sql)

这个 SQL 会创建并开放 REST 写入所需的原始表：

- `tiktok_creator_performance_raw`
- `tiktok_video_performance_raw`
- `tiktok_creator_db_backfill_staging`

### 第二步：使用 REST 入库脚本

当前可用的入库脚本：

```bash
export SUPABASE_URL='https://sbznfjnsirajqkkcwayj.supabase.co'
export SUPABASE_ANON_KEY='你的 Publishable / Anon Key'
python3 /Users/apple/Documents/Playground/tiktok_shop_sync/sync_to_supabase_rest.py --ping-only
python3 /Users/apple/Documents/Playground/tiktok_shop_sync/sync_to_supabase_rest.py
```

说明：

- 脚本会优先读取环境变量：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- 如果只想测试表是否已经可通过 REST 访问，使用：
  - `--ping-only`
- 写入时会按批次把标准明细写入：
  - `tiktok_creator_performance_raw`
  - `tiktok_video_performance_raw`
- 使用的是 Supabase REST，不再依赖当前环境的 Postgres 直连。

现在数据库优先模式已经作为默认主链启用。如果你要手动运行：

```bash
export SUPABASE_URL='https://sbznfjnsirajqkkcwayj.supabase.co'
export SUPABASE_ANON_KEY='你的 Publishable / Anon Key'
python3 /Users/apple/Documents/Playground/tiktok_shop_sync/run_sync_pipeline.py --mode auto
```

在这个模式下：

- 日更成功后会先尝试把标准明细写入线上数据库
- 只有数据库写入成功，才会清理本次原始导出文件
- 如果数据库写入失败，会保留原始导出文件，方便排查
- 当前主链优先依赖 REST 入库；`sync_to_postgres.py` 保留为备用排障脚本，不再作为默认主链

如果你临时想关闭数据库优先模式，可以这样运行：

```bash
export TIKTOK_DB_FIRST=0
python3 /Users/apple/Documents/Playground/tiktok_shop_sync/run_sync_pipeline.py --mode auto
```
