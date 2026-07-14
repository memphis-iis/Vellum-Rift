using UnityEngine;
//access to Unity features
//eventually include 3d screen of current server
//settings tab later
//include controls display 
public class playerController : MonoBehaviour //inherits from MonoBehaviour so you can attach it to a Unity GameObject
{
    //stores whether movement is allowed
    public bool MovementEnabled { get; private set; } = true; //true means player can move false means player is frozen

    //approved way for another script to change movement

    public void SetMovementEnabled(bool enabled)
    {
        MovementEnabled = enabled;
    }
    //checkes whether movement is allowed at every frame
    private void Update()
    {
        if (!MovementEnabled)
        {
            return;
        }

    }
}