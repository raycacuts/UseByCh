import 'react-native-gesture-handler'; // first
import 'react-native-reanimated';      // second

import { AppRegistry } from 'react-native';
import React from 'react';
import App from './App';
import { name as appName } from './app.json';
import { BillingProvider } from './src/context/BillingContext';
import { gestureHandlerRootHOC } from 'react-native-gesture-handler';

const Root = () => (
  <BillingProvider>
    <App />
  </BillingProvider>
);

AppRegistry.registerComponent(appName, () => gestureHandlerRootHOC(Root));
