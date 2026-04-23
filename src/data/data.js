const BTC_SVG = `<svg viewBox="0 0 24 24"><path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z"/></svg>`;
const USDT_SVG = `<svg viewBox="0 0 24 24" fill="white"><text y="16" font-size="11" font-weight="bold" font-family="Arial">₮</text></svg>`;

const QR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></svg>`;
const COPY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:12px;height:12px"><path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PEOPLE = [
    {
        key: "astware",
        name: "AstwareDev",
        role: "Full-Stack Development & UI/UX Design",
        avatar: "https://cdn.discordapp.com/avatars/1167003237963022388/32462f3e53c4681fbcd3fd04f12412b5.png?size=1024",
        url: "https://astwaredev.vercel.app/",
        aboutDesc: "Full-Stack Development & UI/UX Design",
        coins: [
            { coin: "btc", label: "Bitcoin", addr: "bc1qdf3js662dvk8qf20tygjt5d5p4s0r0h4kps0nv", network: "Bitcoin Network", badgeSvg: BTC_SVG, badgeClass: "coin-badge-btc", displayLabel: "Bitcoin (BTC)", qr: "/media/bitcoin/AstwareDev_QR.png" },
            { coin: "usdt", label: "Tether", addr: "0x56a70c858a782A4dCe87e3076dC186CfE21d5488", network: "ERC-20 Network", badgeSvg: USDT_SVG, badgeClass: "coin-badge-usdt", displayLabel: "Tether (USDT)", qr: "/media/tether/AstwareDev_QR.png" }
        ]
    },
    {
        key: "twangy",
        name: "Twangy Money",
        role: "Functionality & Logic (Backend)",
        avatar: "https://cdn.discordapp.com/avatars/1393169412223270942/ba7df37c464e8316cf4eb6e513a153f2.png?size=1024",
        url: "https://twangymoney.xyz",
        aboutDesc: "Functionality & Logic (Backend)",
        coins: [
            { coin: "btc", label: "Bitcoin", addr: "bc1q0zu9xjedayh4kr57nra24ud8vz0kwzrewx5tjp", network: "Bitcoin Network", badgeSvg: BTC_SVG, badgeClass: "coin-badge-btc", displayLabel: "Bitcoin (BTC)", qr: "/media/bitcoin/Twangy_QR.png" },
            { coin: "usdt", label: "Tether", addr: "0xcA5da6cBeBd475a79EdD74Ad56255E5a1DAABf46", network: "ERC-20 Network", badgeSvg: USDT_SVG, badgeClass: "coin-badge-usdt", displayLabel: "Tether (USDT)", qr: "/media/tether/Twangy_QR.png" }
        ]
    },
    {
        key: "arena",
        name: "Arena AI",
        role: null,
        avatar: "https://i.imgur.com/JdyOUB2.png",
        url: null,
        aboutDesc: "For creating the problems we solve",
        coins: null
    }
];

const ICONS = {
    QR_ICON,
    COPY_ICON,
    CHECK_ICON,
    BTC_SVG,
    USDT_SVG
};

const NETWORK_COMMANDS  = "ipconfig /flushdns\nipconfig /release\nipconfig /renew\nnetsh winsock reset\nnetsh int ip reset";
