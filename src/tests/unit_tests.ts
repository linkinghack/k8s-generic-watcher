import "reflect-metadata"
import {PrintConfigFileExample} from "../configs";
import {testCreatPlentyOfPods, testK8sClientCreation, testK8sResources} from "./k8s_client_test";


testK8sClientCreation()
testK8sResources()
// testGetApiGroups();
// testGetApiGroupResource();

// PrintConfigFileExample();

// testCreatPlentyOfPods()