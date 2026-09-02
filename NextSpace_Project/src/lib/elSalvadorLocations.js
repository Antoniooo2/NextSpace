// Main municipalities per department. Not exhaustive — covers the most common
// ones so the Location step has a usable list without an external geo API.
export const EL_SALVADOR_DEPARTMENTS = {
    Ahuachapán: ['Ahuachapán', 'Atiquizaya', 'Concepción de Ataco', 'San Francisco Menéndez', 'Tacuba'],
    'Santa Ana': ['Santa Ana', 'Chalchuapa', 'Metapán', 'Coatepeque', 'El Congo'],
    Sonsonate: ['Sonsonate', 'Acajutla', 'Izalco', 'Nahuizalco', 'Armenia'],
    Chalatenango: ['Chalatenango', 'La Palma', 'Nueva Concepción', 'Tejutla'],
    'La Libertad': ['Santa Tecla', 'Antiguo Cuscatlán', 'La Libertad', 'Zaragoza', 'Colón', 'Quezaltepeque'],
    'San Salvador': [
        'San Salvador',
        'Soyapango',
        'Mejicanos',
        'Apopa',
        'Ilopango',
        'Ciudad Delgado',
        'San Marcos',
        'Ayutuxtepeque',
    ],
    Cuscatlán: ['Cojutepeque', 'Suchitoto', 'San Pedro Perulapán'],
    'La Paz': ['Zacatecoluca', 'Santiago Nonualco', 'San Pedro Masahuat'],
    Cabañas: ['Sensuntepeque', 'Ilobasco', 'Victoria'],
    'San Vicente': ['San Vicente', 'Apastepeque', 'Tecoluca'],
    Usulután: ['Usulután', 'Jiquilisco', 'Santiago de María', 'Berlín'],
    'San Miguel': ['San Miguel', 'Chinameca', 'Chirilagua'],
    Morazán: ['San Francisco Gotera', 'Jocoaitique', 'Corinto'],
    'La Unión': ['La Unión', 'Santa Rosa de Lima', 'Conchagua'],
}

export const EL_SALVADOR_DEPARTMENT_NAMES = Object.keys(EL_SALVADOR_DEPARTMENTS)
