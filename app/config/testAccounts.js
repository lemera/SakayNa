// config/testAccounts.js
export const TEST_ACCOUNTS = {
  commuter: '+639171234567',
  driver: '+639178765432',
};

export const isTestAccount = (phoneNumber) => {
  const formatted = phoneNumber.startsWith('+63') 
    ? phoneNumber 
    : `+63${phoneNumber.replace(/\s/g, "")}`;
  return Object.values(TEST_ACCOUNTS).includes(formatted);
};

export const getUserTypeFromTestAccount = (phoneNumber) => {
  if (phoneNumber === TEST_ACCOUNTS.driver) return 'driver';
  if (phoneNumber === TEST_ACCOUNTS.commuter) return 'commuter';
  return null;
};