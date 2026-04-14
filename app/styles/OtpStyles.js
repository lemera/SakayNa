import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
   referralBanner: {
    flexDirection: "row",
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    marginBottom: 20,
    marginHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFE082",
    gap: 8,
  },
  referralBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#F59E0B",
    fontWeight: "500",
  },
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
    borderWidth: 1,
    borderColor: '#ccc',
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
resendDisabled: {
  color: "#999",
  fontWeight: "600",
},
});