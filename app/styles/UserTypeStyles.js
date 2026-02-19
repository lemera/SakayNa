import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
  },

  logo: {
    width: 180,
    height: 180,
    resizeMode: 'contain',
    marginBottom: 20,
  },

  title: {
    fontSize: 24,
    fontFamily: 'InriaSans-Bold',
    color: '#183B5C',
    textAlign: 'center',
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: '#183B5C',
    textAlign: 'center',
    marginBottom: 30,
  },

  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },

  button: {
    flex: 1,
    marginHorizontal: 10,
    borderRadius: 15,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6, // Android shadow
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'InriaSans-Bold',
  },
});

