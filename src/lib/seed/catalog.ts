/**
 * Sample catalogue for a fictional electronics & accessories shop.
 * Generic product names only - no real brands, companies or people. Supplier
 * emails use the reserved `.example` domain and phones the fictional 555-01xx range.
 */

export type SeedCategory = { key: string; name: string; color: string; skuPrefix: string };

export type SeedSupplier = {
  key: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
};

export type SeedCatalogProduct = {
  name: string;
  description: string;
  category: string;
  supplier: string;
  unitCost: number;
  salePrice: number;
  /**
   * Relative sales weight (1 = slow mover, 10 = best seller). The generator derives
   * each product's reorder level (about three weeks of expected sales) and opening
   * stock from it, so stock levels always match the simulated demand.
   */
  popularity: number;
  /** Largest typical single sale. */
  maxPerSale: number;
};

export const SEED_CATEGORIES: SeedCategory[] = [
  { key: 'audio', name: 'Audio', color: '#8B5CF6', skuPrefix: 'AUD' },
  { key: 'cables', name: 'Cables & Adapters', color: '#0EA5E9', skuPrefix: 'CBL' },
  { key: 'power', name: 'Power & Charging', color: '#F59E0B', skuPrefix: 'PWR' },
  { key: 'computer', name: 'Computer Peripherals', color: '#2563EB', skuPrefix: 'CMP' },
  { key: 'phone', name: 'Phone & Tablet Accessories', color: '#10B981', skuPrefix: 'PHN' },
  { key: 'smart', name: 'Smart Home & Wearables', color: '#EC4899', skuPrefix: 'SMH' },
];

export const SEED_SUPPLIERS: SeedSupplier[] = [
  {
    key: 'northgate',
    name: 'Northgate Components',
    email: 'orders@northgate-components.example',
    phone: '+1 555-0142',
    notes: 'Net 30 terms. Ships from the regional warehouse in 2-3 business days.',
  },
  {
    key: 'blueharbor',
    name: 'Blue Harbor Electronics',
    email: 'sales@blueharbor.example',
    phone: '+1 555-0187',
    notes: 'Minimum order $250. Free freight on orders over $1,000.',
  },
  {
    key: 'summit',
    name: 'Summit Trade Supply',
    email: 'hello@summittrade.example',
    phone: '+1 555-0113',
    notes: 'Cables and smart-home lines. Weekly consolidated shipments on Tuesdays.',
  },
  {
    key: 'coastal',
    name: 'Coastal Distribution Co.',
    email: 'orders@coastal-distribution.example',
    phone: '+1 555-0168',
    notes: 'Phone accessories and chargers. Unsold stock returnable within 60 days.',
  },
  {
    key: 'pinecrest',
    name: 'Pinecrest Wholesale',
    email: 'accounts@pinecrest.example',
    phone: '+1 555-0199',
    notes: 'Peripherals and storage. Volume discounts from 50 units per line.',
  },
];

// prettier-ignore
export const SEED_PRODUCTS: SeedCatalogProduct[] = [
  // Audio
  { category: 'audio', supplier: 'northgate', name: 'Wireless Earbuds with Charging Case', description: 'True wireless earbuds with touch controls, 24 h total battery life and a USB-C charging case.', unitCost: 18.5, salePrice: 39.99, popularity: 9, maxPerSale: 3 },
  { category: 'audio', supplier: 'blueharbor', name: 'Over-Ear Noise-Cancelling Headphones', description: 'Foldable over-ear headphones with active noise cancelling and 30 h playback.', unitCost: 42, salePrice: 89.99, popularity: 6, maxPerSale: 2 },
  { category: 'audio', supplier: 'northgate', name: 'Portable Bluetooth Speaker 10 W', description: 'Splash-resistant speaker with 12 h battery and a built-in lanyard.', unitCost: 14.2, salePrice: 29.99, popularity: 7, maxPerSale: 3 },
  { category: 'audio', supplier: 'blueharbor', name: 'USB Condenser Microphone', description: 'Cardioid desktop microphone for calls, streaming and podcasts. Plug and play.', unitCost: 24, salePrice: 54.99, popularity: 3, maxPerSale: 2 },
  { category: 'audio', supplier: 'northgate', name: 'Wired In-Ear Headphones 3.5 mm', description: 'Lightweight in-ear headphones with inline microphone and three tip sizes.', unitCost: 2.8, salePrice: 9.99, popularity: 8, maxPerSale: 5 },
  { category: 'audio', supplier: 'blueharbor', name: 'Soundbar 2.1 with Wireless Subwoofer', description: '120 W soundbar with wireless subwoofer, optical and HDMI ARC inputs.', unitCost: 68, salePrice: 139, popularity: 2, maxPerSale: 1 },
  { category: 'audio', supplier: 'northgate', name: 'Kids Volume-Limited Headphones', description: 'On-ear headphones limited to 85 dB, with a padded adjustable headband.', unitCost: 7.5, salePrice: 19.99, popularity: 4, maxPerSale: 2 },
  { category: 'audio', supplier: 'northgate', name: 'Waterproof Shower Speaker', description: 'IPX7 mini speaker with suction cup and hands-free calling.', unitCost: 6.9, salePrice: 17.99, popularity: 3, maxPerSale: 2 },
  { category: 'audio', supplier: 'blueharbor', name: 'Clip-On Lavalier Microphone', description: 'Omnidirectional lapel microphone with 2 m cable and 3.5 mm TRRS plug.', unitCost: 5.4, salePrice: 14.99, popularity: 3, maxPerSale: 2 },
  { category: 'audio', supplier: 'northgate', name: 'Headphone Stand with USB Hub', description: 'Aluminium headphone stand with two USB-A ports and cable management.', unitCost: 11, salePrice: 26.99, popularity: 2, maxPerSale: 1 },

  // Cables & Adapters
  { category: 'cables', supplier: 'summit', name: 'USB-C to USB-C Cable 1 m (60 W)', description: 'Braided USB-C cable for charging at up to 60 W and USB 2.0 data.', unitCost: 1.9, salePrice: 9.99, popularity: 10, maxPerSale: 6 },
  { category: 'cables', supplier: 'summit', name: 'USB-C to USB-C Cable 2 m (100 W)', description: 'Two-metre braided cable with e-marker chip for 100 W laptop charging.', unitCost: 3.1, salePrice: 14.99, popularity: 7, maxPerSale: 4 },
  { category: 'cables', supplier: 'summit', name: 'USB-A to USB-C Cable 1 m', description: 'Fast-charging cable for older chargers and computers.', unitCost: 1.4, salePrice: 7.99, popularity: 8, maxPerSale: 6 },
  { category: 'cables', supplier: 'summit', name: 'HDMI 2.1 Cable 2 m', description: 'High-speed cable supporting 4K at 120 Hz and 8K at 60 Hz.', unitCost: 3.6, salePrice: 16.99, popularity: 6, maxPerSale: 4 },
  { category: 'cables', supplier: 'pinecrest', name: 'DisplayPort 1.4 Cable 1.8 m', description: 'Locking DisplayPort cable for high-refresh monitors up to 8K.', unitCost: 4.2, salePrice: 17.99, popularity: 3, maxPerSale: 2 },
  { category: 'cables', supplier: 'summit', name: 'USB-C to HDMI Adapter 4K', description: 'Compact adapter for connecting laptops and tablets to a TV or monitor.', unitCost: 5.8, salePrice: 19.99, popularity: 5, maxPerSale: 3 },
  { category: 'cables', supplier: 'pinecrest', name: 'USB-C 7-in-1 Multiport Hub', description: 'HDMI 4K, three USB-A ports, SD and microSD readers and 100 W pass-through.', unitCost: 13.5, salePrice: 39.99, popularity: 6, maxPerSale: 2 },
  { category: 'cables', supplier: 'summit', name: 'Cat 6 Ethernet Cable 3 m', description: 'Snagless gigabit network cable with gold-plated connectors.', unitCost: 1.7, salePrice: 8.99, popularity: 4, maxPerSale: 5 },
  { category: 'cables', supplier: 'summit', name: '3.5 mm Audio Cable 1.2 m', description: 'Male-to-male auxiliary cable for speakers, car stereos and headphones.', unitCost: 0.9, salePrice: 5.99, popularity: 3, maxPerSale: 4 },
  { category: 'cables', supplier: 'summit', name: 'Micro-USB Cable 1 m', description: 'Charging and data cable for older phones, speakers and accessories.', unitCost: 0.8, salePrice: 4.99, popularity: 2, maxPerSale: 4 },

  // Power & Charging
  { category: 'power', supplier: 'coastal', name: '20 W USB-C Wall Charger', description: 'Compact fast charger with USB Power Delivery for phones and tablets.', unitCost: 4.1, salePrice: 17.99, popularity: 9, maxPerSale: 4 },
  { category: 'power', supplier: 'blueharbor', name: '65 W GaN Laptop Charger', description: 'Two USB-C ports and one USB-A port; charges a laptop and a phone at once.', unitCost: 16.8, salePrice: 44.99, popularity: 6, maxPerSale: 2 },
  { category: 'power', supplier: 'coastal', name: 'Power Bank 10,000 mAh', description: 'Slim power bank with USB-C input/output and 20 W fast charging.', unitCost: 9.6, salePrice: 27.99, popularity: 8, maxPerSale: 3 },
  { category: 'power', supplier: 'blueharbor', name: 'Power Bank 20,000 mAh with USB-C PD', description: 'High-capacity power bank with 45 W output, enough for a small laptop.', unitCost: 15.9, salePrice: 42.99, popularity: 5, maxPerSale: 2 },
  { category: 'power', supplier: 'coastal', name: '15 W Wireless Charging Pad', description: 'Charging pad for wireless-charging phones, with foreign-object detection and LED indicator.', unitCost: 6.2, salePrice: 21.99, popularity: 5, maxPerSale: 2 },
  { category: 'power', supplier: 'blueharbor', name: '3-in-1 Wireless Charging Stand', description: 'Charges a phone, earbuds and a watch together. Adapter included.', unitCost: 17.4, salePrice: 49.99, popularity: 3, maxPerSale: 1 },
  { category: 'power', supplier: 'coastal', name: 'Dual-Port Car Charger 36 W', description: 'USB-C and USB-A car charger with fast charging on both ports.', unitCost: 3.9, salePrice: 14.99, popularity: 5, maxPerSale: 3 },
  { category: 'power', supplier: 'blueharbor', name: '6-Outlet Surge Protector Strip', description: 'Six outlets, two USB ports and a 1.8 m cord with surge protection.', unitCost: 8.3, salePrice: 24.99, popularity: 3, maxPerSale: 2 },
  { category: 'power', supplier: 'coastal', name: 'Universal Travel Adapter', description: 'All-in-one plug adapter for 150+ countries with two USB ports.', unitCost: 7.1, salePrice: 22.99, popularity: 3, maxPerSale: 2 },
  { category: 'power', supplier: 'coastal', name: 'Solar Power Bank 12,000 mAh', description: 'Rugged outdoor power bank with solar panel and built-in flashlight.', unitCost: 12.4, salePrice: 34.99, popularity: 1, maxPerSale: 1 },

  // Computer Peripherals
  { category: 'computer', supplier: 'pinecrest', name: 'Wireless Optical Mouse', description: 'Quiet-click wireless mouse with USB receiver and 18-month battery life.', unitCost: 4.6, salePrice: 16.99, popularity: 8, maxPerSale: 4 },
  { category: 'computer', supplier: 'pinecrest', name: 'Ergonomic Vertical Mouse', description: 'Vertical grip reduces wrist strain; six buttons and adjustable DPI.', unitCost: 9.8, salePrice: 29.99, popularity: 3, maxPerSale: 2 },
  { category: 'computer', supplier: 'northgate', name: 'Mechanical Keyboard TKL', description: 'Tenkeyless mechanical keyboard with hot-swappable switches and white backlight.', unitCost: 28.5, salePrice: 69.99, popularity: 4, maxPerSale: 1 },
  { category: 'computer', supplier: 'pinecrest', name: 'Wireless Keyboard and Mouse Combo', description: 'Full-size keyboard and mouse sharing a single USB receiver.', unitCost: 14.3, salePrice: 39.99, popularity: 5, maxPerSale: 2 },
  { category: 'computer', supplier: 'northgate', name: '1080p Webcam with Microphone', description: 'Full HD webcam with auto light correction, privacy shutter and dual microphones.', unitCost: 13.2, salePrice: 39.99, popularity: 5, maxPerSale: 2 },
  { category: 'computer', supplier: 'pinecrest', name: 'Aluminium Laptop Stand', description: 'Adjustable stand that raises the screen to eye level; folds flat.', unitCost: 10.9, salePrice: 32.99, popularity: 4, maxPerSale: 2 },
  { category: 'computer', supplier: 'pinecrest', name: 'Extended Desk Mat 90 x 40 cm', description: 'Water-resistant desk mat with stitched edges and non-slip base.', unitCost: 5.2, salePrice: 18.99, popularity: 4, maxPerSale: 2 },
  { category: 'computer', supplier: 'northgate', name: 'USB 3.2 Flash Drive 64 GB', description: 'Metal-body flash drive with read speeds up to 150 MB/s.', unitCost: 3.9, salePrice: 12.99, popularity: 7, maxPerSale: 5 },
  { category: 'computer', supplier: 'northgate', name: 'Portable SSD 1 TB', description: 'Pocket-size USB-C solid-state drive, up to 1,000 MB/s.', unitCost: 48, salePrice: 99.99, popularity: 4, maxPerSale: 1 },
  { category: 'computer', supplier: 'pinecrest', name: 'Monitor Light Bar', description: 'Screen-mounted LED bar with adjustable colour temperature and no glare.', unitCost: 15.6, salePrice: 44.99, popularity: 2, maxPerSale: 1 },

  // Phone & Tablet Accessories
  { category: 'phone', supplier: 'coastal', name: 'Tempered Glass Screen Protector 6.1"', description: '9H tempered glass with installation frame. Pack of two.', unitCost: 0.7, salePrice: 9.99, popularity: 10, maxPerSale: 5 },
  { category: 'phone', supplier: 'coastal', name: 'Clear Shockproof Phone Case 6.1"', description: 'Slim clear case with reinforced corners that resists yellowing.', unitCost: 1.8, salePrice: 14.99, popularity: 8, maxPerSale: 4 },
  { category: 'phone', supplier: 'coastal', name: 'Heavy-Duty Kickstand Phone Case 6.7"', description: 'Dual-layer protective case with a built-in kickstand.', unitCost: 3.4, salePrice: 19.99, popularity: 5, maxPerSale: 3 },
  { category: 'phone', supplier: 'pinecrest', name: 'Magnetic Car Phone Mount', description: 'Air-vent mount with strong magnets and 360-degree rotation.', unitCost: 4.2, salePrice: 16.99, popularity: 5, maxPerSale: 3 },
  { category: 'phone', supplier: 'pinecrest', name: 'Adjustable Aluminium Phone Stand', description: 'Desk stand for phones and small tablets with adjustable angle.', unitCost: 3.1, salePrice: 12.99, popularity: 4, maxPerSale: 3 },
  { category: 'phone', supplier: 'coastal', name: 'Tablet Sleeve 11"', description: 'Padded sleeve with a front pocket for a charger and a stylus.', unitCost: 5.6, salePrice: 19.99, popularity: 2, maxPerSale: 2 },
  { category: 'phone', supplier: 'pinecrest', name: 'Stylus Pen with Palm Rejection', description: 'Rechargeable active stylus with tilt support for tablets.', unitCost: 8.9, salePrice: 27.99, popularity: 3, maxPerSale: 2 },
  { category: 'phone', supplier: 'coastal', name: 'Bluetooth Selfie Stick Tripod', description: 'Extendable selfie stick that doubles as a tripod, with detachable remote.', unitCost: 6.3, salePrice: 21.99, popularity: 3, maxPerSale: 2 },
  { category: 'phone', supplier: 'pinecrest', name: 'microSD Card 128 GB', description: 'UHS-I U3 memory card with SD adapter, rated for 4K video.', unitCost: 7.4, salePrice: 19.99, popularity: 6, maxPerSale: 3 },
  { category: 'phone', supplier: 'coastal', name: 'Phone Grip and Stand', description: 'Collapsible adhesive grip that also works as a stand.', unitCost: 0.6, salePrice: 6.99, popularity: 4, maxPerSale: 5 },

  // Smart Home & Wearables
  { category: 'smart', supplier: 'summit', name: 'Wi-Fi Smart Plug', description: 'App-controlled plug with schedules and energy monitoring. No hub required.', unitCost: 5.1, salePrice: 16.99, popularity: 6, maxPerSale: 4 },
  { category: 'smart', supplier: 'summit', name: 'Smart LED Bulb E27 Colour', description: 'Dimmable 9 W bulb with 16 million colours and tunable white.', unitCost: 4.3, salePrice: 13.99, popularity: 6, maxPerSale: 4 },
  { category: 'smart', supplier: 'blueharbor', name: 'Indoor Security Camera 2K', description: 'Pan-and-tilt camera with night vision, motion alerts and two-way audio.', unitCost: 16.2, salePrice: 44.99, popularity: 4, maxPerSale: 2 },
  { category: 'smart', supplier: 'blueharbor', name: 'Wi-Fi Video Doorbell', description: 'Battery video doorbell with HD video, chime and motion zones.', unitCost: 27.8, salePrice: 79.99, popularity: 3, maxPerSale: 1 },
  { category: 'smart', supplier: 'summit', name: 'Smart Motion Sensor', description: 'Battery-powered PIR sensor that triggers lights and automations.', unitCost: 6.7, salePrice: 19.99, popularity: 2, maxPerSale: 2 },
  { category: 'smart', supplier: 'blueharbor', name: 'Fitness Tracker Band', description: 'Heart-rate, sleep and step tracking with 10-day battery life.', unitCost: 12.6, salePrice: 39.99, popularity: 5, maxPerSale: 2 },
  { category: 'smart', supplier: 'summit', name: 'Smart LED Light Strip 5 m', description: 'Cuttable RGB light strip with music sync and app control.', unitCost: 8.4, salePrice: 26.99, popularity: 4, maxPerSale: 2 },
  { category: 'smart', supplier: 'summit', name: 'Wi-Fi Range Extender AC1200', description: 'Dual-band repeater with Ethernet port and signal-strength indicator.', unitCost: 11.9, salePrice: 34.99, popularity: 3, maxPerSale: 2 },
  { category: 'smart', supplier: 'summit', name: 'Door and Window Contact Sensor', description: 'Magnetic open/close sensor for alarms and automations.', unitCost: 3.8, salePrice: 12.99, popularity: 2, maxPerSale: 3 },
  { category: 'smart', supplier: 'blueharbor', name: 'Smart Wi-Fi Thermostat', description: 'Programmable thermostat with app control, schedules and usage reports.', unitCost: 38, salePrice: 99.99, popularity: 1, maxPerSale: 1 },
];
