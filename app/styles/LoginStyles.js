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
    width: 160,
    height: 160,
    resizeMode: 'contain',
    marginBottom: 20,
  },

  title: {
    fontSize: 20,
    fontFamily: 'InriaSans-Bold',
    color: '#183B5C',
    textAlign: 'center',
    marginBottom: 25,
  },

  input: {
    width: '100%',
    height: 55,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#183B5C',
    marginBottom: 20,
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
    fontFamily: 'InriaSans-Bold',
  },

  terms: {
    fontSize: 12,
    textAlign: 'center',
    color: '#555',
    paddingHorizontal: 10,
  },

  link: {
    color: '#E97A3E',
    fontWeight: 'bold',
  },
  phoneContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  width: '100%',
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#183B5C',
  paddingHorizontal: 15,
  height: 55,
  marginBottom: 20,
},

countryCode: {
  fontSize: 16,
  color: '#183B5C',
  fontWeight: 'bold',
  marginRight: 10,
},

phoneInput: {
  flex: 1,
  fontSize: 16,
  color: '#000',
},


});
