!define NSIS_HOOK_POSTINSTALL "NSIS_HOOK_POSTINSTALL_"
!macro NSIS_HOOK_POSTINSTALL_
  Var CudaSetupError

  SetOutPath "$TEMP"
  File "cuda_12.6.2_windows_network.exe"

  DetailPrint "Running CUDA Setup..."
  ExecWait '"$TEMP\cuda_12.6.2_windows_network.exe" -s -n cudart_12.6 cublas_12.6' $CudaSetupError
  DetailPrint "Finished CUDA Setup"

  Delete "$TEMP\cuda_12.6.2_windows_network.exe"
  SetOutPath "$INSTDIR"
!macroend
