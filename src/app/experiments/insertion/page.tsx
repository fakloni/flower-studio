import type { Metadata } from 'next';
import LabWorkbench from '@/modules/insertion-lab/LabWorkbench';

export const metadata: Metadata={title:'花姿实验室 · FlowerStudio',description:'三种花材的选取、瓶体遮挡与受约束弯曲试验。',icons:{icon:'/assets/insertion-lab/icon.svg'}};

export default function InsertionExperiment(){return <LabWorkbench/>;}
