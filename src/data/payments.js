import { PROPERTIES } from './properties'


const rentedProperty = PROPERTIES.find((p) => p.id === 1)

export const BUSINESS_LEASE = {
    property: rentedProperty,
    ownerName: rentedProperty.ownerName,
    rent: rentedProperty.price,
    contractId: 'CS-2023-089',
    startDate: 'Nov 1, 2023',
    status: 'Active',
}

export const BUSINESS_UPCOMING_PAYMENT = {
    month: 'January',
    dueInDays: 5,
    amount: rentedProperty.price,
}

export const BUSINESS_SCHEDULE = [
    { label: 'NOV', day: 23, status: 'paid', ref: 'EXP-98210' },
    { label: 'DEC', day: 23, status: 'paid', ref: 'EXP-98265' },
    { label: 'JAN', day: 24, status: 'pending', dueInDays: 5 },
    { label: 'FEB', day: 24, status: 'upcoming' },
    { label: 'MAR', day: 24, status: 'upcoming' },
]

export const BUSINESS_PAYMENT_HISTORY = [
    {
        label: 'December 2023',
        date: '01/12/2023',
        amount: rentedProperty.price,
        method: 'Bank Transfer (Agrícola)',
        status: 'Paid',
    },
    {
        label: 'November 2023',
        date: '02/11/2023',
        amount: rentedProperty.price,
        method: 'Visa Card',
        status: 'Paid',
    },
    {
        label: 'Security Deposit',
        date: '25/10/2023',
        amount: rentedProperty.price * 2,
        method: 'Cash / Office',
        status: 'Paid',
    },
]



export const OWNER_LEASES = [
    { propertyId: 2, tenantName: 'Elena Mitau', rent: 1200, status: 'paid', dueDate: 'Jan 5' },
    { propertyId: 4, tenantName: 'Carlos Rivas', rent: 450, status: 'pending', dueDate: 'Jan 24' },
    { propertyId: 5, tenantName: 'Marta Escobar', rent: 1100, status: 'overdue', dueDate: 'Jan 10' },
]

export const OWNER_PAYMENT_HISTORY = [
    {
        propertyTitle: 'Edificio Avante',
        tenantName: 'Elena Mitau',
        date: '01/12/2023',
        amount: 1200,
        method: 'Bank Transfer',
        status: 'Paid',
    },
    {
        propertyTitle: 'Boutique Corner',
        tenantName: 'Carlos Rivas',
        date: '24/11/2023',
        amount: 450,
        method: 'Cash',
        status: 'Paid',
    },
    {
        propertyTitle: 'Logistics Center S3',
        tenantName: 'Marta Escobar',
        date: '10/11/2023',
        amount: 1100,
        method: 'Bank Transfer',
        status: 'Paid',
    },
]