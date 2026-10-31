# パレットの候補

`art/witchs-treat.gpl`（今の 64 色）と番号・名前は同じで、色だけを替えた候補。ゲームはまだ使っていない。`compare.png` が見比べ（上から 今・A〜D、左から 1 面・2 面のボス・3 面・最後のボス）。

- `famicom.gpl`（A）: ファミコンの決まった色に寄せる。とても暗い色は黒、似た色はまとまる
- `hueshift.gpl`（B）: ドット絵の色の階段。暗い色は青紫、明るい色は黄色寄り。中ほどだけ鮮やか
- `storybook.gpl`（C）: 彩度を落とした手選びの色に寄せる。絵本のように
- `pc98.gpl`（D）: 群青の夜。冷たい青を土台に、暖色は灯りとお菓子だけ

`original.gpl` は最初の色（2026-10-31 に storybook を試すため、art/witchs-treat.gpl を storybook の色にした。戻すときはこれを写す）。`python3 palettes/make.py` は original.gpl から作り直すように直してある。決めたら、その .gpl の色を `art/witchs-treat.gpl` に写して（並びはそのまま）、`node tools/art.mjs`。Pixel もその色で描くようになる。

2026-10-31: storybook に決めて、同じ色をまとめて 26 色にした（art/witchs-treat.gpl。古い名前は `# alias`）。絵の色の文字もそろえ直した。`storybook64.gpl` はまとめる前の 64 色（original.gpl と同じ並び）。ここの候補は 64 色の並びのままなので、今の art/ には写せない（使うなら絵の番号の付け替えが要る）
