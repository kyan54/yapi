// Preserve the application's AntD 3 theme when using AntD 6 components.
// Native body/heading defaults live in common.scss because ConfigProvider
// tokens only style AntD components, not arbitrary plugin markup.
const textColor = 'rgba(13, 27, 62, 0.65)';
const headingColor = 'rgba(39, 56, 72, 0.85)';
const secondaryTextColor = 'rgba(13, 27, 62, 0.43)';
const disabledTextColor = 'rgba(13, 27, 62, 0.45)';

export default {
  token: {
    colorPrimary: '#2395f1',
    colorInfo: '#2395f1',
    colorSuccess: '#57cf27',
    colorError: '#ff561b',
    colorWarning: '#fac200',
    colorText: textColor,
    colorTextHeading: headingColor,
    colorTextLabel: headingColor,
    colorTextSecondary: secondaryTextColor,
    colorTextDescription: secondaryTextColor,
    colorTextDisabled: disabledTextColor,
    colorTextPlaceholder: disabledTextColor,
    colorBgLayout: '#eceef1',
    colorBgContainer: '#fff',
    colorBgContainerDisabled: '#f7f7f7',
    colorBorder: '#d9d9d9',
    colorBorderSecondary: '#e9e9e9',
    fontSize: 13,
    fontSizeLG: 16,
    lineHeight: 1.5,
    lineHeightLG: 1.5,
    fontWeightStrong: 500,
    borderRadius: 4,
    borderRadiusSM: 2,
    borderRadiusLG: 4,
    controlHeight: 32,
    controlHeightLG: 36,
    controlHeightSM: 26
  },
  components: {
    Layout: {
      bodyBg: '#eceef1',
      headerBg: '#32363a',
      headerHeight: 56,
      headerPadding: 0,
      siderBg: '#fff'
    },
    Button: { paddingInline: 16, paddingInlineSM: 7 },
    Input: { paddingInline: 9, paddingInlineSM: 9, paddingInlineLG: 9, addonBg: '#eee' },
    Table: {
      headerBg: '#eee',
      headerColor: headingColor,
      headerSortActiveBg: '#eee',
      headerSplitColor: 'transparent',
      cellPaddingBlock: 16,
      cellPaddingInline: 10,
      borderColor: '#e9e9e9',
      rowSelectedBg: '#fafafa'
    },
    Tag: { defaultBg: '#f3f3f3', defaultColor: textColor }
  }
};
