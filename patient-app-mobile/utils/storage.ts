import * as SecureStore from 'expo-secure-store';

export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'auth_user',
  HOSPITAL_ID: 'auth_hospital_id',
  HOSPITAL_NAME: 'auth_hospital_name',
};

export async function saveSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`Error saving secure item for key ${key}:`, error);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`Error retrieving secure item for key ${key}:`, error);
    return null;
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error(`Error deleting secure item for key ${key}:`, error);
  }
}

export async function clearAuthStorage(): Promise<void> {
  await deleteSecureItem(STORAGE_KEYS.TOKEN);
  await deleteSecureItem(STORAGE_KEYS.USER);
  await deleteSecureItem(STORAGE_KEYS.HOSPITAL_ID);
  await deleteSecureItem(STORAGE_KEYS.HOSPITAL_NAME);
}
