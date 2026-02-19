import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  logo: {
    width: 180,
    height: 180,
    resizeMode: 'contain',
    marginBottom: 15, // adds spacing below logo
  },

  taglineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },

  rideText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#183B5C',
  },

  commaText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#183B5C',
  },

  travelText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#E97A3E',
  },
});
