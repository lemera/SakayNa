import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
  },

  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#183B5C',
    textAlign: 'center',
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 16,
    color: '#555',
    marginBottom: 30,
  },

  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 30,
  },

  otpInput: {
    width: 50,
    height: 60,
    borderWidth: 2,
    borderColor: '#183B5C',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 'bold',
    backgroundColor: '#FFFFFF',
  },

  button: {
    width: '100%',
    backgroundColor: '#183B5C',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 20,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  resend: {
    fontSize: 14,
    color: '#555',
  },

  resendLink: {
    color: '#E97A3E',
    fontWeight: 'bold',
  },
  logo: {
  width: 140,
  height: 140,
  resizeMode: 'contain',
  marginBottom: 20,
},
});