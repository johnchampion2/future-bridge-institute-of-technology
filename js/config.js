const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxprIhA0e4T5fZ81PlnesMZqvXF_XrLEn6FAv-ZiHpqxdzvtjrtRAuzCzGbt42tq6_Adg/exec',
  INSTITUTION: 'FutureBridge Institute of Technology & Innovation',
  SHORT: 'FBITI',
  LOGO: 'assets/logo.png',      // put your logo file here (falls back to a "FB" monogram)
  CURRENCY: 'Le',
  SPLASH_MS: 5000,
  SYNC_INTERVAL_MS: 30000,
  PHONE_GROUPS: [3, 3, 3],      // nine digits shown as XXX-XXX-XXX. For 11 digits like XXX-XX-XXX-XXX use [3, 2, 3, 3]
  ABOUT: [
    'FutureBridge Institute of Technology & Innovation (FBITI) is a technical and vocational training institution offering practical Certificate and Diploma programmes in information technology, business, design and technical trades.',
    'Our aim is to equip every student with job-ready skills, creativity and a spirit of innovation. Flexible morning, afternoon, evening and weekend study periods allow learners to fit quality training around their lives.'
  ],
  PROGRAMMES: {
    Certificate: ['ICT & Computer Studies', 'Graphics Design & Multimedia', 'Digital Marketing', 'E-Commerce',
      'Electrical Installation', 'Solar Installation Technology', 'Computer Networking', 'Web Development',
      'Software Development', 'CCTV Installation', 'Printer & Computer Repair', 'Fashion & Apparel Technology',
      'Photography & Event Coverage'],
    Diploma: ['Diploma in Information Technology', 'Diploma in Computer Science', 'Diploma in Software Development',
      'Diploma in Technology & Innovation', 'Diploma in Digital Business & Entrepreneurship']
  }
};
