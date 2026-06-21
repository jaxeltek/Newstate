NEWSTATHELA
A complete referral-based earning platform with M-PESA integration, Spin & Win, video rewards, and blog reading challenges.

📖 Overview
Newstatehela Agencies is a full-stack web application where users earn money by referring friends, watching videos, reading blogs, and playing Spin & Win. Integrated with Safaricom M-PESA for payments.

✨ Key Features
Feature	Description
Authentication	Register/Login with email, phone, password
 -Referrals	Unique referral link, Ksh 50 per referral
 -Wallet	M-PESA deposits, withdrawals (min Ksh 300)
 -Spin & Win	Win 0, 20, 30, 50, or 100 Ksh
 -Watch & Earn	Ksh 5 per video watched
 -Read & Earn	7-day blog challenge, Ksh 30 reward
 -Dashboard	Real-time earnings, transactions, referrals
 -Admin Panel	User management, withdrawal approvals
Tech Stack
**Backend**
*Node.js + Express.js
*PostgreSQL database
*JWT authentication
*bcryptjs for passwords
*Axios for API calls

**Frontend**
HTML5, CSS3, TailwindCSS
Vanilla JavaScript
Font Awesome icons
APIs
Safaricom Daraja API (M-PESA STK Push)

YouTube API (videos)

referral-earning-app/
├── backend/
│   ├── config/db.js              # Database connection
│   ├── data/
│   │   ├── blogs.js              # Static blog content
│   │   └── videos.js             # Static video content
│   ├── middleware/
│   │   ├── auth.js               # JWT authentication
│   │   └── validate.js           # Input validation
│   ├── routes/
│   │   ├── auth.js               # Login/Register
│   │   ├── referrals.js          # Referral management
│   │   ├── wallet.js             # Deposits & withdrawals
│   │   ├── spin.js               # Spin & Win
│   │   ├── videos.js             # Video management
│   │   ├── blogs.js              # Blog management
│   │   └── admin.js              # Admin functions
│   ├── utils/mpesa.js            # M-PESA utilities
│   ├── .env                      # Environment variables
│   ├── package.json
│   └── server.js                 # Main entry point
├── frontend/
│   ├── assets/css/style.css      # Custom styles
│   ├── js/
│   │   ├── auth.js               # Login/Register logic
│   │   └── dashboard.js          # Dashboard logic
│   ├── index.html                # Landing page
│   └── dashboard.html            # Dashboard page
└── README.md
