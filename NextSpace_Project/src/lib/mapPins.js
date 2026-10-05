export const MAP_WIDTH = 1000
export const MAP_HEIGHT = 559

export const MAP_PINS = [
    { department: 'Ahuachap\u00e1n', capital: 'Ahuachap\u00e1n', lat: 13.9214, lon: -89.845, x: 120.7, y: 229.5 },
    { department: 'Sonsonate', capital: 'Sonsonate', lat: 13.7189, lon: -89.7242, x: 169.4, y: 313.5 },
    { department: 'Santa Ana', capital: 'Santa Ana', lat: 13.9942, lon: -89.5597, x: 235.7, y: 199.2 },
    { department: 'La Libertad', capital: 'Santa Tecla', lat: 13.6769, lon: -89.2797, x: 348.6, y: 330.9 },
    { department: 'San Salvador', capital: 'San Salvador', lat: 13.6989, lon: -89.1914, x: 384.2, y: 321.8 },
    { department: 'Chalatenango', capital: 'Chalatenango', lat: 14.0372, lon: -88.935, x: 487.5, y: 181.4 },
    { department: 'Cuscatl\u00e1n', capital: 'Cojutepeque', lat: 13.7167, lon: -88.9333, x: 488.2, y: 314.4 },
    { department: 'La Paz', capital: 'Zacatecoluca', lat: 13.5081, lon: -88.8697, x: 513.8, y: 401 },
    { department: 'San Vicente', capital: 'San Vicente', lat: 13.6403, lon: -88.7847, x: 548.1, y: 346.1 },
    { department: 'Caba\u00f1as', capital: 'Sensuntepeque', lat: 13.8783, lon: -88.6286, x: 611, y: 247.3 },
    { department: 'Usulut\u00e1n', capital: 'Usulut\u00e1n', lat: 13.3446, lon: -88.4386, x: 687.6, y: 468.8 },
    { department: 'San Miguel', capital: 'San Miguel', lat: 13.4833, lon: -88.1833, x: 790.5, y: 411.3 },
    { department: 'Moraz\u00e1n', capital: 'San Francisco Gotera', lat: 13.695, lon: -88.105, x: 822, y: 323.4 },
    { department: 'La Uni\u00f3n', capital: 'La Uni\u00f3n', lat: 13.3369, lon: -87.8439, x: 927.3, y: 472 },
].map((pin) => ({ ...pin, left: (pin.x / MAP_WIDTH) * 100, top: (pin.y / MAP_HEIGHT) * 100 }))
