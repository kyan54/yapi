# Shared style migration: statistics regression

## Compared inputs

- Legacy source: `fd90eaf108c0382db133a6650e368e5d7d38734a`, Ant Design 3.2.2.
- Modern source before these fixes: `0bce16f7b13459ac93a5d5e6aefd24114a867b59`, Ant Design 6.6.5.
- User-supplied old and new statistics screenshots, inspected directly. They show a normal versus enormously enlarged “分组数据详情” heading, muted versus black text, and normal versus navigation-height search input.
- The legacy checked-in stylesheet (`static/prd/index@38e61939aaa7223d6fa9.css`) and legacy `client/styles/theme.less` provide the original CSS values. Screenshot pixels include browser/device scaling; they are not CSS-pixel measurements.

## Root causes and changes

### Native text inherited the 100px rem layout root

`common.scss` intentionally sets `html { font-size: 100px }`: `.56rem` is a 56px header and `.24rem` is 24px spacing. Previously the full AntD stylesheet supplied a **13px body font size**, 1.5 line height, body background and text/heading colors. Replacing that stylesheet with AntD 6 `reset.css` removed those defaults. ConfigProvider's font token applies to AntD components, not arbitrary native markup.

The statistics detail title is a native `h3` outside an AntD component. Without a body baseline it inherits 100px and its native 1.17em scale gives **117 CSS pixels**. The neighboring overview is inside AntD Rows with their own component text reset, which explains why that region stayed approximately normal-sized. An isolated `.statis-title` font-size override would hide the symptom while leaving other native text exposed.

Changes:

- Restore body size 13px, line height 1.5, text `rgba(13, 27, 62, 0.65)` and background `#eceef1` in `common.scss`.
- Restore native heading color `rgba(39, 56, 72, 0.85)` and weight 500. Keep their existing relative font sizing. The detail `h3` resolves to 15.21 CSS pixels; overview `h2` resolves to 19.5 CSS pixels.
- Keep the 100px rem root intact; do not shrink all page geometry to repair typography.
- Load AntD reset before application styles, making ownership of application defaults explicit.

### Component theme migration was incomplete

The old Less theme had application-specific text colors, control heights and table styling. The initial ConfigProvider only migrated primary color, base size, radius and part of Layout. AntD 6 consequently reverted to black/default component text, a different table header and padding, and different small/large control sizes.

`client/styles/theme.js` now maps the relevant legacy tokens: body/heading/secondary/disabled/placeholder colors; status colors; 13px/16px fonts; line heights; 500 heading weight; 26/32/36px controls; radii and borders; Layout background; Input horizontal padding; Button padding; table `#eee` header, heading color, 16px vertical/10px horizontal cell padding and no new header separators; Tag colors. This restores shared contracts rather than patching statistics-specific AntD internals. It is not a complete reimplementation of AntD 3.

### Header search inherited navigation line height

AntD 6's custom-input AutoComplete (`select-input-customize`) explicitly inherits font size and line height. Its flex content therefore inherited the header's `.56rem` line height. The custom Input's affix wrapper stretched with that content. The old stylesheet instead gave AutoComplete inputs an explicit 32px height and 1.5 line height.

`Search.scss` establishes a local 13px/1.5 text context and gives the search input's affix wrapper a 32px height. The header remains 56px and other navigation items are unaffected. The test checks actual AntD-rendered markup, where `className="search-input"` belongs to the affix wrapper rather than the inner native input.

## Impact inventory

| Area | Expected effect | Remaining review |
| --- | --- | --- |
| Statistics detail title and native text | Removes 100px inherited typography; restores muted colors | Render populated and empty groups at the same viewport/zoom as the reference |
| Statistics overview and all AntD tables | Restores old theme colors, line height, header and standard cell density | Confirm row alignment, overflow and sorting with representative data |
| Header search on every route | Stops navigation line-height leakage; restores 32px input | Type, clear, use keyboard selection, open/close results, navigate and repeat |
| Native headings in group/project/user pages, Postman, timeline, footer and plugins | Shares the corrected body and heading baseline | Inspect these routes, including text outside AntD wrappers |
| Shared form controls and buttons | Restores legacy small/default/large control sizes and text colors | Inspect compact groups, wrapping labels, disabled and validation states |
| Layout and plugins | Keeps existing rem geometry and restores body/Layout background | Check nested layouts and horizontal overflow |

The screenshots use different data sets and operating systems. Different group counts, CPU/memory values and an empty table are not evidence of a style regression. AntD 6's empty-state illustration and outlined SVG icon appearance also differ from AntD 3; these changes are not fixed by the shared typography patch.

### Additional selector migration risks

These source selectors still reference AntD 3 DOM structure. Their presence is a concrete compatibility risk, **not proof of a separately reproduced visual failure**, and they are not covered by this patch:

- `client/styles/common.scss`: `.ant-confirm`, `.ant-tabs-bar`, `.ant-tabs-nav-container`, `.ant-tree li ...`.
- `client/containers/Project/Interface/interface.scss`: card tab rules beneath `.ant-tabs-bar` and `.ant-tabs-nav-container`.
- `client/containers/Project/Interface/InterfaceList/Edit.scss`: `.ant-select-selection` and `.ant-select-selection__rendered`.
- `client/containers/Group/ProjectList/ProjectList.scss`: `.ant-tabs-bar` and old input-group assumptions.
- `client/containers/Project/Setting/ProjectData/ProjectData.scss`: `.ant-confirm-btns`.

Component-specific migration should use supported AntD 6 tokens/semantic hooks or verified current markup. Broad alias selectors without rendered-flow checks could create new overlap, spacing or focus regressions.

## Verification and limits

Run `node --test test-modernization/visual-style-contract.test.js`.

Five focused checks pass:

1. Reset/application import ordering and ConfigProvider theme installation.
2. Compiled CSS native typography, body color/background and preserved rem root in jsdom.
3. Actual AntD server-rendered custom search markup with the scoped CSS contract.
4. Actual statistics table markup with populated and empty data, unchanged detail heading and expected computed font scale.
5. Resolved AntD tokens for legacy colors, control sizes, line height and table density.

Before the fix, the baseline text check failed because body size computed as 100px. Focused JavaScript lint and `git diff --check` also pass (the legacy ESLint executable emits Node deprecation warnings).

These are source/CSS, server-rendered markup and jsdom checks. They do **not** execute a real browser, establish actual rendered geometry, prove screenshot parity or validate search interaction. Browser execution in the cloud workspace was denied, so no screenshot runner, tunnel or alternate browser route was attempted. Exact-final-build browser acceptance remains required before claiming full visual compatibility.
